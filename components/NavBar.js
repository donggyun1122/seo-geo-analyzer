import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { SHOPPING_ENABLED } from "../lib/featureFlags";

// 메뉴 구성. children이 있는 항목은 하위 메뉴가 있는 그룹입니다.
//  - 데스크톱: 가운데 메뉴줄에서 마우스를 올리면(또는 클릭하면) 하위 메뉴가 떠요.
//  - 모바일(768px 이하): 오른쪽 위 ☰ 버튼을 누르면 전체 메뉴 패널이 열리고, 그룹은 눌러서
//    펼치는 아코디언 방식이에요.
const NAV_ITEMS = [
  { href: "/seo", label: "SEO" },
  { href: "/geo", label: "GEO·AEO" },
  { href: "/keyword", label: "키워드 분석" },
  {
    label: "플레이스 분석",
    children: [
      { href: "/keyword-place-list", label: "키워드 순위표" },
      { href: "/place", label: "플레이스 순위" },
    ],
  },
  {
    label: "검색광고 분석",
    children: [
      { href: "/search-ad", label: "노출 광고 현황" },
      { href: "/search-ad-rank", label: "키워드 노출분석" },
    ],
  },
  { href: "/news-clipping", label: "뉴스 클리핑" },
  ...(SHOPPING_ENABLED
    ? [
        {
          label: "네이버 쇼핑 분석",
          children: [
            { href: "/shopping-keyword-analysis", label: "네이버 쇼핑 키워드 분석" },
            { href: "/shopping-rank-check", label: "네이버 쇼핑 순위 체크" },
          ],
        },
      ]
    : []),
];

function groupIsActive(item, pathname) {
  return !!item.children && item.children.some((c) => c.href === pathname);
}

export default function NavBar() {
  const router = useRouter();
  const pathname = router.pathname;

  // 데스크톱 드롭다운: 클릭으로 연 그룹(마우스오버는 CSS가 처리)
  const [desktopOpen, setDesktopOpen] = useState(null);
  // 모바일 패널 열림 여부 + 패널 안에서 펼친 그룹
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState(null);
  const headerRef = useRef(null);

  // 페이지가 바뀌면 열려있던 메뉴를 모두 닫습니다.
  useEffect(() => {
    setDesktopOpen(null);
    setMobileOpen(false);
  }, [pathname]);

  // 모바일 패널을 열 때, 지금 보고 있는 화면이 속한 그룹은 미리 펼쳐둡니다.
  useEffect(() => {
    if (mobileOpen) {
      const active = NAV_ITEMS.find((it) => groupIsActive(it, pathname));
      setMobileGroup(active ? active.label : null);
    }
  }, [mobileOpen, pathname]);

  // 메뉴 바깥을 누르거나 Esc를 누르면 닫힙니다.
  useEffect(() => {
    if (!desktopOpen && !mobileOpen) return undefined;
    function onOutside(e) {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setDesktopOpen(null);
        setMobileOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") {
        setDesktopOpen(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [desktopOpen, mobileOpen]);

  return (
    <header className="site-nav" ref={headerRef}>
      <div className="site-nav-inner">
        <Link href="/" className="site-logo">
          SEO 사이트 분석기
        </Link>

        {/* 데스크톱 메뉴 */}
        <nav className="site-nav-links" aria-label="주요 메뉴">
          {NAV_ITEMS.map((item) => {
            if (item.children) {
              const isOpen = desktopOpen === item.label;
              return (
                <div className={`site-nav-dropdown${isOpen ? " open" : ""}`} key={item.label}>
                  <button
                    type="button"
                    className={`site-nav-link site-nav-dropdown-trigger${groupIsActive(item, pathname) ? " active" : ""}`}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                    onClick={() => setDesktopOpen(isOpen ? null : item.label)}
                  >
                    {item.label}
                    <span className="site-nav-dropdown-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  <div className="site-nav-submenu">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`site-nav-submenu-link${pathname === child.href ? " active" : ""}`}
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
                className={`site-nav-link${pathname === item.href ? " active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="site-nav-spacer" aria-hidden="true" />

        {/* 모바일 메뉴 버튼 */}
        <button
          type="button"
          className={`mnav-toggle${mobileOpen ? " open" : ""}`}
          aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={mobileOpen}
          aria-controls="mnav-panel"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="mnav-toggle-bar" />
          <span className="mnav-toggle-bar" />
          <span className="mnav-toggle-bar" />
        </button>
      </div>

      {/* 모바일 메뉴 패널 */}
      <nav id="mnav-panel" className={`mnav-panel${mobileOpen ? " open" : ""}`} aria-label="모바일 메뉴" aria-hidden={!mobileOpen}>
        <ul className="mnav-list">
          {NAV_ITEMS.map((item) => {
            if (item.children) {
              const expanded = mobileGroup === item.label;
              return (
                <li key={item.label} className={`mnav-group${expanded ? " expanded" : ""}`}>
                  <button
                    type="button"
                    className={`mnav-item mnav-group-trigger${groupIsActive(item, pathname) ? " active" : ""}`}
                    aria-expanded={expanded}
                    tabIndex={mobileOpen ? 0 : -1}
                    onClick={() => setMobileGroup(expanded ? null : item.label)}
                  >
                    <span>{item.label}</span>
                    <span className="mnav-chevron" aria-hidden="true" />
                  </button>
                  <ul className="mnav-sublist">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className={`mnav-subitem${pathname === child.href ? " active" : ""}`}
                          tabIndex={mobileOpen && expanded ? 0 : -1}
                          onClick={() => setMobileOpen(false)}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            }
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`mnav-item${pathname === item.href ? " active" : ""}`}
                  tabIndex={mobileOpen ? 0 : -1}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
