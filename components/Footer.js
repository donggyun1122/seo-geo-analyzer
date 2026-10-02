import Link from "next/link";
import { SITE, NAV_GROUPS } from "../lib/siteNav";

// 사이트 공통 푸터. 메뉴는 상단 메뉴와 같은 목록(lib/siteNav.js)을 써요.
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link href="/" className="gnb-logo" aria-label={`${SITE.name} 홈`}>
            <span className="gnb-logo-mark" aria-hidden="true">
              DG
            </span>
            <span className="gnb-logo-text">MKT LAB</span>
          </Link>
          <p>{SITE.tagline}</p>
          <p className="site-footer-message">{SITE.messageEn}</p>
        </div>
        <div className="site-footer-cols">
          {NAV_GROUPS.map((group) => (
            <div key={group.key} className="site-footer-col">
              <h4>{group.label}</h4>
              <ul>
                {group.items.map((item) => (
                  <li key={item.label}>
                    {item.href && !item.soon ? (
                      <Link href={item.href}>{item.label}</Link>
                    ) : (
                      <span className="site-footer-soon">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>© 2026 {SITE.name}</span>
        <span>{SITE.tagline}</span>
      </div>
    </footer>
  );
}
