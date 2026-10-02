import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Icon from "./Icon";
import { SITE, NAV_GROUPS } from "../lib/siteNav";

// 상단 메뉴(GNB). 메뉴 구성은 lib/siteNav.js 에서 관리해요.
//  - 데스크톱: 가운데 5개 영역(SEARCH/ADVERTISING/LOCAL/INTELLIGENCE/REPORT)에 마우스를 올리거나
//    누르면 큰 드롭다운이 열려요. 오른쪽에는 Dashboard 버튼.
//  - 모바일(900px 이하): 로고 + ☰ 버튼. 누르면 전체 메뉴가 열리고 영역별로 펼쳐볼 수 있어요.

function groupIsActive(group, pathname) {
  return group.items.some((it) => it.href === pathname);
}

function MenuItem({ item, pathname, onNavigate, tabIndex }) {
  const body = (
    <>
      <span className="gnb-item-icon">
        <Icon name={item.icon} size={18} />
      </span>
      <span className="gnb-item-text">
        <span className="gnb-item-label">
          {item.label}
          {item.soon && <span className="gnb-soon">Soon</span>}
        </span>
        <span className="gnb-item-desc">{item.desc}</span>
      </span>
    </>
  );
  if (item.soon || !item.href) {
    return (
      <span className="gnb-item gnb-item-disabled" aria-disabled="true">
        {body}
      </span>
    );
  }
  return (
    <Link href={item.href} className={`gnb-item${pathname === item.href ? " active" : ""}`} onClick={onNavigate} tabIndex={tabIndex}>
      {body}
    </Link>
  );
}

export default function NavBar() {
  const router = useRouter();
  const pathname = router.pathname;

  const [desktopOpen, setDesktopOpen] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState(null);
  const headerRef = useRef(null);

  // 페이지가 바뀌면 열려있던 메뉴를 모두 닫습니다.
  useEffect(() => {
    setDesktopOpen(null);
    setMobileOpen(false);
  }, [pathname]);

  // 모바일 패널을 열 때, 지금 보고 있는 화면이 속한 영역은 미리 펼쳐둡니다.
  useEffect(() => {
    if (mobileOpen) {
      const active = NAV_GROUPS.find((g) => groupIsActive(g, pathname));
      setMobileGroup(active ? active.key : null);
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

  const closeAll = () => {
    setDesktopOpen(null);
    setMobileOpen(false);
  };

  return (
    <header className="gnb" ref={headerRef}>
      <div className="gnb-inner">
        <Link href="/" className="gnb-logo" aria-label={`${SITE.name} 홈`}>
          <span className="gnb-logo-mark" aria-hidden="true">
            DG
          </span>
          <span className="gnb-logo-text">MKT LAB</span>
        </Link>

        {/* 데스크톱 메뉴 */}
        <nav className="gnb-menu" aria-label="주요 메뉴">
          {NAV_GROUPS.map((group) => {
            const isOpen = desktopOpen === group.key;
            return (
              <div className={`gnb-group${isOpen ? " open" : ""}`} key={group.key}>
                <button
                  type="button"
                  className={`gnb-trigger${groupIsActive(group, pathname) ? " active" : ""}`}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onClick={() => setDesktopOpen(isOpen ? null : group.key)}
                >
                  {group.label}
                </button>
                <div className="gnb-panel" role="group" aria-label={group.label}>
                  <div className="gnb-panel-intro">
                    <span className="gnb-panel-eyebrow">{group.label}</span>
                    <strong>{group.title}</strong>
                    <p>{group.desc}</p>
                  </div>
                  <div className="gnb-panel-items">
                    {group.items.map((item) => (
                      <MenuItem key={item.label} item={item} pathname={pathname} onNavigate={closeAll} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="gnb-right">
          <Link href="/dashboard" className={`gnb-dashboard${pathname === "/dashboard" ? " active" : ""}`}>
            Dashboard
          </Link>
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
      </div>

      {/* 모바일 메뉴 패널 */}
      <nav id="mnav-panel" className={`mnav-panel${mobileOpen ? " open" : ""}`} aria-label="모바일 메뉴" aria-hidden={!mobileOpen}>
        <ul className="mnav-list">
          {NAV_GROUPS.map((group) => {
            const expanded = mobileGroup === group.key;
            return (
              <li key={group.key} className={`mnav-group${expanded ? " expanded" : ""}`}>
                <button
                  type="button"
                  className={`mnav-item mnav-group-trigger${groupIsActive(group, pathname) ? " active" : ""}`}
                  aria-expanded={expanded}
                  tabIndex={mobileOpen ? 0 : -1}
                  onClick={() => setMobileGroup(expanded ? null : group.key)}
                >
                  <span>{group.label}</span>
                  <span className="mnav-chevron" aria-hidden="true">
                    <Icon name="chevronDown" size={18} />
                  </span>
                </button>
                <div className="mnav-sublist">
                  {group.items.map((item) => (
                    <MenuItem
                      key={item.label}
                      item={item}
                      pathname={pathname}
                      onNavigate={closeAll}
                      tabIndex={mobileOpen && expanded ? 0 : -1}
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mnav-foot">
          <Link href="/dashboard" className="btn btn-primary btn-block" tabIndex={mobileOpen ? 0 : -1} onClick={closeAll}>
            Dashboard
          </Link>
        </div>
      </nav>
    </header>
  );
}
