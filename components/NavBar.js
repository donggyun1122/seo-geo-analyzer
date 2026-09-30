import Link from "next/link";
import { useRouter } from "next/router";

const NAV_ITEMS = [
  { href: "/seo", label: "SEO" },
  { href: "/geo", label: "GEO·AEO" },
  { href: "/keyword", label: "키워드 분석" },
  { href: "/keyword-place-list", label: "키워드 순위표" },
  { href: "/place", label: "플레이스 순위" },
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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`site-nav-link${router.pathname === item.href ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="site-nav-spacer" aria-hidden="true" />
      </div>
    </header>
  );
}
