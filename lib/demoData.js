// 홈 화면 미리보기용 예시(Demo) 데이터.
// 실제 측정값이 아니라 화면 구성을 보여주기 위한 샘플이에요. 나중에 실제 API 데이터로 바꿀 때는
// 같은 모양의 객체를 각 컴포넌트에 props로 넘기면 돼요(컴포넌트는 이 파일을 직접 몰라도 동작해요).

const days = (n) => Array.from({ length: n }, (_, i) => (i === n - 1 ? "오늘" : `${n - 1 - i}일 전`));

export const HERO_OVERVIEW = {
  title: "Marketing Overview",
  period: "Last 30 Days",
  kpis: [
    { label: "Search Visibility", value: 82, delta: 6.1, deltaSuffix: "pt" },
    { label: "Keyword Growth", value: 24.8, prefix: "+", suffix: "%", decimals: 1, delta: 4.2, deltaSuffix: "%p" },
    { label: "GEO Visibility", value: 78, suffix: "%", delta: 9.0, deltaSuffix: "%p" },
    { label: "Competitor Changes", value: 12, prefix: "+", delta: 3, deltaSuffix: "건", neutral: true },
  ],
  chart: {
    title: "Marketing Visibility",
    unit: "",
    labels: days(30),
    values: [52, 54, 53, 56, 58, 57, 60, 59, 61, 63, 62, 64, 66, 65, 67, 66, 69, 70, 69, 72, 71, 73, 75, 74, 76, 78, 77, 79, 81, 82],
  },
};

export const FEATURE_PREVIEWS = {
  search: {
    question: "How visible is your brand?",
    metrics: [
      { label: "SEO Score", value: "82", meter: 82 },
      { label: "GEO Visibility", value: "74", meter: 74 },
      { label: "Keyword Coverage", value: "68", meter: 68 },
    ],
    chart: { title: "Search Visibility", values: [48, 52, 50, 55, 58, 56, 61, 60, 64, 67, 66, 70, 72, 75] },
  },
  advertising: {
    question: "Where is your performance changing?",
    metrics: [
      { label: "CTR", value: "4.82%", delta: 12.4, good: true },
      { label: "CPC", value: "₩1,240", delta: -8.2, good: true },
      { label: "ROAS", value: "482%", delta: 24.1, good: true },
    ],
    chart: { title: "Performance Trend", values: [310, 325, 318, 340, 362, 355, 380, 392, 388, 410, 432, 428, 455, 482] },
  },
  local: {
    question: "How visible is your business?",
    metrics: [
      { label: "Ranking", value: "#3", delta: 2, deltaLabel: "2계단", good: true },
      { label: "Reviews", value: "4.8", sub: "/ 5.0" },
      { label: "Visibility", value: "82", meter: 82 },
    ],
    chart: { title: "Ranking Trend", values: [9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3], invert: true, step: true },
  },
  competitor: {
    question: "What changed around you?",
    rows: [
      { name: "Competitor A", note: "신규 키워드", value: "+8" },
      { name: "Competitor B", note: "검색 노출 변화", value: "+14%" },
      { name: "Competitor C", note: "신규 콘텐츠", value: "5건" },
    ],
    chart: { title: "Share of Search", values: [31, 32, 31, 33, 34, 33, 35, 36, 35, 37, 38, 37, 39, 40] },
  },
  market: {
    question: "What is moving the market?",
    rows: [
      { name: "Search", note: "검색 결과 화면 개편 이슈", value: "News" },
      { name: "AI · GEO", note: "생성형 검색 노출 트렌드", value: "Trend" },
      { name: "Industry", note: "업계 주요 이슈 모니터링", value: "Issue" },
    ],
    chart: { title: "Issue Volume", values: [12, 15, 13, 18, 16, 21, 19, 24, 22, 20, 26, 29, 27, 31] },
  },
};

export const TODAY_INTELLIGENCE = {
  searchTrend: [
    { rank: "01", name: "Keyword A", change: 42 },
    { rank: "02", name: "Keyword B", change: 28 },
    { rank: "03", name: "Keyword C", change: 21 },
  ],
  keywords: [
    { name: "Keyword D", volume: "48,200", competition: "높음", trend: [4, 5, 5, 6, 7, 8, 9] },
    { name: "Keyword E", volume: "22,900", competition: "중간", trend: [6, 6, 7, 6, 8, 8, 9] },
    { name: "Keyword F", volume: "9,400", competition: "낮음", trend: [3, 4, 4, 5, 5, 7, 8] },
  ],
  competitor: [
    { label: "경쟁사 신규 키워드", value: "+8", note: "Competitor A" },
    { label: "경쟁사 노출 변화", value: "+14%", note: "Competitor B" },
    { label: "신규 콘텐츠", value: "5건", note: "Competitor C" },
  ],
  news: [
    { tag: "검색", title: "검색 결과 화면 개편 관련 소식" },
    { tag: "광고", title: "검색광고 상품·정책 업데이트" },
    { tag: "AI · GEO", title: "생성형 검색 노출 관련 동향" },
    { tag: "산업", title: "업계 주요 이슈 요약" },
  ],
};
