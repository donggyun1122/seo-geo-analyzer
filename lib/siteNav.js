// DG MKT LAB — 사이트 정보구조(IA).
// 상단 메뉴(GNB), 모바일 메뉴, 푸터, 홈 화면, Dashboard, 페이지 상단 경로 표시가 모두 이 파일 하나를 봐요.
// 새 기능을 추가할 때는 해당 영역의 items에 한 줄만 넣으면 전체에 반영돼요.
//
//  - href가 있는 항목: 지금 쓸 수 있는 기능(기존 페이지 주소 그대로)
//  - soon: true 인 항목: 아직 준비 중 — 메뉴에는 보이지만 눌러지지 않고 "Soon" 표시가 붙어요.

export const SITE = {
  name: "DG MKT LAB",
  tagline: "Marketing Intelligence Platform",
  message: "데이터를 보면, 다음 마케팅이 보입니다.",
  messageEn: "Analyze data. Discover insights. Take action.",
};

export const NAV_GROUPS = [
  {
    key: "search",
    label: "SEARCH",
    title: "Search Intelligence",
    desc: "검색엔진과 생성형 검색에서 브랜드가 어떻게 보이는지 분석합니다.",
    items: [
      { label: "SEO Analysis", ko: "SEO 분석", desc: "웹사이트 SEO 상태 및 검색엔진 최적화 분석", href: "/seo", icon: "search" },
      { label: "GEO · AEO", ko: "GEO · AEO 분석", desc: "생성형 검색 및 AI 검색 노출 분석", href: "/geo", icon: "sparkles" },
      { label: "Keyword Analysis", ko: "키워드 분석", desc: "키워드 검색량, 경쟁도, 트렌드 및 연관 데이터 분석", href: "/keyword", icon: "hash" },
      { label: "Search Result Analysis", desc: "검색 결과 및 검색 노출 환경 분석", soon: true, icon: "monitor" },
      { label: "Keyword Monitoring", desc: "주요 키워드의 변화 모니터링", soon: true, icon: "bell" },
    ],
  },
  {
    key: "advertising",
    label: "ADVERTISING",
    title: "Advertising Intelligence",
    desc: "검색광고 노출과 소재 데이터를 분석하고 개선 포인트를 찾습니다.",
    items: [
      { label: "Search Ads Analysis", ko: "키워드 노출분석", desc: "키워드별 우리 검색광고의 PC·모바일 노출 순위 분석", href: "/search-ad-rank", icon: "target" },
      { label: "Ad Creative Analysis", ko: "노출 광고 현황", desc: "키워드에 노출되는 광고주와 광고 소재·문구 분석", href: "/search-ad", icon: "image" },
      { label: "Ad Performance", desc: "광고 성과 및 주요 KPI 분석", soon: true, icon: "barChart" },
      { label: "Landing Page Analysis", desc: "광고 랜딩페이지 및 전환 환경 분석", soon: true, icon: "panelTop" },
    ],
  },
  {
    key: "local",
    label: "LOCAL",
    title: "Local Intelligence",
    desc: "플레이스 검색 노출과 순위, 고객 반응을 분석합니다.",
    items: [
      { label: "Place Analysis", ko: "키워드 순위표", desc: "키워드로 노출되는 네이버 플레이스 업체 순위 분석", href: "/keyword-place-list", icon: "mapPin" },
      { label: "Place Ranking", ko: "플레이스 순위", desc: "우리 매장의 플레이스 검색 순위 추적", href: "/place", icon: "listOrdered" },
      { label: "Review Analysis", desc: "리뷰 및 고객 반응 분석", soon: true, icon: "messageSquare" },
    ],
  },
  {
    key: "intelligence",
    label: "INTELLIGENCE",
    title: "Market Intelligence",
    desc: "시장 변화와 업계·경쟁사 이슈를 빠르게 확인합니다.",
    items: [
      { label: "News Clipping", ko: "고객사 뉴스 클리핑", desc: "고객사·산업 관련 주요 뉴스 수집", href: "/news-clipping", icon: "newspaper" },
      { label: "Marketing Trend", desc: "마케팅 시장의 주요 트렌드 분석", soon: true, icon: "trendingUp" },
      { label: "Industry Issues", desc: "업계 주요 이슈 모니터링", soon: true, icon: "alertCircle" },
      { label: "Competitor Monitoring", desc: "경쟁사의 검색·콘텐츠·마케팅 활동 모니터링", soon: true, icon: "eye" },
    ],
  },
  {
    key: "report",
    label: "REPORT",
    title: "Report",
    desc: "분석 결과를 한눈에 확인하고 공유합니다.",
    items: [
      { label: "Marketing Dashboard", ko: "Dashboard", desc: "주요 마케팅 분석 기능을 한눈에 확인", href: "/dashboard", icon: "layoutDashboard" },
      { label: "Analysis Report", desc: "분석 결과를 리포트 형태로 확인", soon: true, icon: "fileText" },
      { label: "Export", desc: "분석 데이터를 다양한 형태로 내보내기", soon: true, icon: "download" },
    ],
  },
];

// 주소 → { group, item } (페이지 상단 경로 표시, 메뉴 활성 표시용)
export function findNavByPath(pathname) {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href && item.href === pathname) return { group, item };
    }
  }
  return null;
}

// 홈 화면 "Quick Analysis" 카드 8개
export const QUICK_TOOLS = [
  { tag: "SEO", label: "SEO Analysis", desc: "사이트의 검색엔진 최적화 상태 진단", href: "/seo", icon: "search" },
  { tag: "GEO", label: "GEO · AEO", desc: "AI·생성형 검색 노출 준비도 분석", href: "/geo", icon: "sparkles" },
  { tag: "KEYWORD", label: "Keyword Analysis", desc: "검색량·경쟁도·연관 키워드 분석", href: "/keyword", icon: "hash" },
  { tag: "ADS", label: "Search Ads", desc: "검색광고 노출 순위와 소재 분석", href: "/search-ad", icon: "target" },
  { tag: "PLACE", label: "Place Analysis", desc: "플레이스 노출 업체와 순위 분석", href: "/keyword-place-list", icon: "mapPin" },
  { tag: "COMPETITOR", label: "Competitor Analysis", desc: "경쟁사 검색·마케팅 활동 분석", soon: true, icon: "eye" },
  { tag: "TREND", label: "Search Trend", desc: "키워드 검색 추이와 시즌성 확인", href: "/keyword", icon: "trendingUp" },
  { tag: "NEWS", label: "News Clipping", desc: "고객사·산업 주요 뉴스 모니터링", href: "/news-clipping", icon: "newspaper" },
];
