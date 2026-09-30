import Link from "next/link";
import { useRouter } from "next/router";

// children이 있는 항목은 마우스오버 시 하위 메뉴를 보여주는 드롭다운으로 렌더링합니다
// (아래 site-nav-dropdown 관련 CSS가 순수 hover 방식으로 처리해요 — styles/globals.css 참고).
const NAV_ITEMS = [
  { href: "/seo", label: "SEO" },
  { href: "/geo", label: "GEO·AEO" },
  { href: "/keyword", label: "키워드 분석" },
  { href: "/keyword-place-list", label: "키워드 순위표" },
  { href: "/place", label: "플레이스 순위" },
  {
    label: "네이버 쇼핑 분석",
    children: [
      { href: "/shopping-keyword-analysis", label: "네이버 쇼핑 키워드 분석" },
      { href: "/shopping-rank-check", label: "네이버 쇼핑 순위 체크" },
    ],
  },
];

export default function NavBar() {
  const router = useRouter();

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="site-logo">
          SEO 사이트 분석기
        </Link>
        <nav className="site-nav-links">
          {NAV_ITEMS.map((item) => {
            if (item.children) {
              const isChildActive = item.children.some((c) => router.pathname === c.href);
              return (
                <div className="site-nav-dropdown" key={item.label}>
                  <span className={`site-nav-link site-nav-dropdown-trigger${isChildActive ? " active" : ""}`}>
                    {item.label}
                    <span className="site-nav-dropdown-caret" aria-hidden="true">
                      ▾
                    </span>
                  </span>
                  <div className="site-nav-submenu">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`site-nav-submenu-link${router.pathname === child.href ? " active" : ""}`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`site-nav-link${router.pathname === item.href ? " active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="site-nav-spacer" aria-hidden="true" />
      </div>
    </header>
  );
}
