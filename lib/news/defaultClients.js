// 뉴스 클리핑 기본 고객사 목록 (22곳).
//
// Supabase에 news_clients 테이블이 있으면 그 목록을 쓰고, 없으면(또는 비어 있으면) 이 목록을 써요.
// 화면의 "모니터링 기업" 창에서 추가·수정하려면 Supabase에 테이블을 만들어야 해요(supabase/schema.sql).
//
// 항목 설명
//  - name: 화면에 보일 기업명
//  - keywords: 네이버 뉴스에서 검색할 단어들. 기사 제목이나 요약에 이 중 하나가 들어있어야 그 기업 기사로 봐요.
//              (띄어쓰기·대소문자는 무시하고 비교해요. 예: "빅히트뮤직" = "빅히트 뮤직")
//  - requireAny: (선택) 이름이 흔한 단어일 때 쓰는 "문맥 단어". 이 중 하나라도 함께 나와야 인정해요.
//                예: 카약 → 여행·항공·호텔 같은 단어가 같이 나와야 여행 검색 서비스 카약 기사로 봐요.
//  - excludeKeywords: (선택) 이 단어가 들어간 기사는 빼요(엉뚱한 기사 걸러내기).
//  - ignoreTerms: (선택) 키워드를 품고 있는 다른 단어. 이 단어 속의 키워드는 매칭으로 안 쳐요.
//                 예: 하이브 ↔ "하이브리드"
//  - matchScope: "title" 이면 기사 제목에 키워드가 있을 때만 인정(기사가 아주 많은 대기업용). 기본은 제목+요약.
//  - domain: 로고(파비콘)를 가져올 공식 사이트 주소. 확실한 곳만 적었고, 없으면 이름 첫 글자로 표시해요.

const DEFAULT_CLIENTS = [
  {
    name: "교원",
    keywords: ["교원그룹", "교원투어", "교원라이프", "교원웰스", "교원 빨간펜"],
    domain: "kyowon.co.kr",
  },
  { name: "BIGHIT MUSIC", keywords: ["빅히트뮤직", "BIGHIT MUSIC"], domain: "ibighit.com" },
  { name: "삼성자산운용", keywords: ["삼성자산운용"], domain: "samsungfund.com" },
  { name: "고려은단", keywords: ["고려은단"], domain: "eundan.com" },
  {
    name: "하이브",
    keywords: ["하이브", "HYBE"],
    ignoreTerms: ["하이브리드"],
    matchScope: "title",
    domain: "hybecorp.com",
  },
  { name: "구몬", keywords: ["구몬"], domain: "kumon.co.kr" },
  { name: "LG전자", keywords: ["LG전자"], matchScope: "title", domain: "lge.co.kr" },
  { name: "DB손해보험", keywords: ["DB손해보험", "DB손보"], domain: "idbins.com" },
  { name: "아고다", keywords: ["아고다"], domain: "agoda.com" },
  { name: "이투스", keywords: ["이투스"], domain: "etoos.com" },
  { name: "레뷰", keywords: ["레뷰코퍼레이션", "레뷰"], domain: "revu.net" },
  { name: "부킹닷컴", keywords: ["부킹닷컴"], domain: "booking.com" },
  { name: "디클래시", keywords: ["디클래시"], domain: "dclassy.co.kr" },
  { name: "스카이스캐너", keywords: ["스카이스캐너"], domain: "skyscanner.co.kr" },
  { name: "KOZ 엔터테인먼트", keywords: ["KOZ엔터테인먼트", "KOZ 엔터"], domain: "kozofficial.com" },
  { name: "쌤소나이트", keywords: ["쌤소나이트"], domain: "samsonite.com" },
  { name: "미소페", keywords: ["미소페"], domain: "misope.co.kr" },
  { name: "와이어바알리", keywords: ["와이어바알리"], domain: "wirebarley.com" },
  {
    name: "브람스",
    keywords: ["브람스"],
    // 가구 브랜드 브람스 — 가구 관련 단어가 함께 나온 기사만 인정하고, 작곡가·드라마 기사는 제외해요.
    requireAny: ["가구", "소파", "리클라이너", "안마의자", "침대", "매트리스", "인테리어", "리빙", "쇼룸"],
    excludeKeywords: ["교향곡", "협주곡", "작곡가", "소나타", "피아니스트", "바이올리니스트", "오케스트라", "브람스를 좋아하세요"],
  },
  {
    name: "카약",
    keywords: ["카약"],
    requireAny: ["KAYAK", "여행", "항공", "호텔", "숙소", "항공권", "앱", "플랫폼", "검색"],
    ignoreTerms: ["카약킹"],
    domain: "kayak.co.kr",
  },
  { name: "호텔스컴바인", keywords: ["호텔스컴바인"], domain: "hotelscombined.co.kr" },
  { name: "스카이라이프", keywords: ["스카이라이프"], domain: "skylife.co.kr" },
];

// DB 행(snake_case) 또는 기본 목록 항목을 화면/수집용 공통 형태로 바꿔요.
function normalizeClient(raw, index) {
  const arr = (v) =>
    (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
      .map((s) => String(s).trim())
      .filter(Boolean);
  const keywords = arr(raw.keywords);
  const name = String(raw.name || "").trim();
  return {
    id: raw.id || `default-${index}`,
    name,
    keywords: keywords.length ? keywords : name ? [name] : [],
    requireAny: arr(raw.requireAny || raw.require_any),
    excludeKeywords: arr(raw.excludeKeywords || raw.exclude_keywords),
    ignoreTerms: arr(raw.ignoreTerms || raw.ignore_terms),
    matchScope: (raw.matchScope || raw.match_scope) === "title" ? "title" : "title_desc",
    domain: (raw.domain || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null,
    sortOrder: Number.isFinite(raw.sort_order) ? raw.sort_order : index,
  };
}

function getDefaultClients() {
  return DEFAULT_CLIENTS.map((c, i) => normalizeClient(c, i));
}

module.exports = { DEFAULT_CLIENTS, normalizeClient, getDefaultClients };
