import Head from "next/head";
import { useRouter } from "next/router";
import "../styles/globals.css";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { SITE, findNavByPath } from "../lib/siteNav";

// 모든 페이지 공통 틀: 상단 메뉴 → (분석 페이지면) 현재 위치 표시 → 페이지 내용 → 푸터
export default function App({ Component, pageProps }) {
  const { pathname } = useRouter();
  const nav = findNavByPath(pathname);
  // 자체 머리말에 위치를 표시하는 페이지는 공통 위치 표시를 생략해요.
  const showCrumb = nav && pathname !== "/news-clipping" && pathname !== "/dashboard";
  const title = nav ? `${nav.item.label} · ${SITE.name}` : `${SITE.name} — ${SITE.tagline}`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={`${SITE.name} — ${SITE.tagline}. SEO · 검색 · 광고 · 플레이스 · 시장 데이터를 한 곳에서 분석합니다.`} />
      </Head>
      <NavBar />
      <main className="site-main">
        {showCrumb && (
          <div className="page-crumb" aria-label="현재 위치">
            <span>{nav.group.label}</span>
            <span className="page-crumb-sep" aria-hidden="true">
              /
            </span>
            <strong>{nav.item.label}</strong>
          </div>
        )}
        <Component {...pageProps} />
      </main>
      <Footer />
    </>
  );
}
