import Link from "next/link";
import { useRouter } from "next/router";

const NAV_ITEMS = [
  { href: "/seo", label: "SEO" },
  { href: "/geo", label: "GEO·SEO" },
  { href: "/keyword", label: "키워드 분석" },
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
      </div>
    </header>
  );
}
