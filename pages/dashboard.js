import Link from "next/link";
import Icon from "../components/Icon";
import { NAV_GROUPS } from "../lib/siteNav";

// Dashboard — 모든 분석 기능을 영역별로 모아둔 시작 화면.
// 메뉴 목록(lib/siteNav.js)을 그대로 보여줘서, 기능이 추가되면 여기에도 자동으로 나타나요.
export default function DashboardPage() {
  const groups = NAV_GROUPS.filter((g) => g.key !== "report");
  const ready = groups.reduce((n, g) => n + g.items.filter((i) => i.href && !i.soon).length, 0);
  const soon = groups.reduce((n, g) => n + g.items.filter((i) => i.soon).length, 0);

  return (
    <div className="wrap dash">
      <header className="dash-head">
        <div>
          <span className="eyebrow">REPORT / MARKETING DASHBOARD</span>
          <h1>Dashboard</h1>
          <p>분석할 영역을 선택하세요.</p>
        </div>
        <dl className="dash-stats">
          <div>
            <dt>분석 영역</dt>
            <dd>{groups.length}</dd>
          </div>
          <div>
            <dt>사용 가능</dt>
            <dd>{ready}</dd>
          </div>
          <div>
            <dt>준비 중</dt>
            <dd>{soon}</dd>
          </div>
        </dl>
      </header>

      {groups.map((group) => (
        <section key={group.key} className="dash-group">
          <div className="dash-group-head">
            <h2>{group.label}</h2>
            <p>{group.desc}</p>
          </div>
          <div className="dash-grid">
            {group.items.map((item) => {
              const inner = (
                <>
                  <span className="quick-card-top">
                    <span className="quick-card-icon">
                      <Icon name={item.icon} size={20} />
                    </span>
                    {item.soon && <span className="gnb-soon">Soon</span>}
                  </span>
                  <strong>{item.label}</strong>
                  {item.ko && <span className="dash-card-ko">{item.ko}</span>}
                  <span className="quick-card-desc">{item.desc}</span>
                  {!item.soon && (
                    <span className="quick-card-foot">
                      <span className="quick-card-go">분석하기</span>
                      <span className="quick-card-arrow">
                        <Icon name="arrowRight" size={18} />
                      </span>
                    </span>
                  )}
                </>
              );
              return item.soon ? (
                <div key={item.label} className="quick-card quick-card-disabled" aria-disabled="true">
                  {inner}
                </div>
              ) : (
                <Link key={item.label} href={item.href} className="quick-card">
                  {inner}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
