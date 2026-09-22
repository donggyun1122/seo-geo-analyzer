// GEO 엔티티 점수 페이지의 "분석 전 미리보기"에 쓰이는 정적 설명 데이터입니다.
// 실제 채점 로직(lib/geoEntityAnalysis.js)과는 별개로, 각 항목이 "무엇을 왜 보는지"를 짧게 설명합니다.
export const GEO_CHECK_CATALOG = {
  coreEntity: {
    label: "핵심 엔티티 구성",
    weight: 55,
    icon: "🧩",
    items: [
      { label: "JSON-LD 존재 (서버 렌더링)", desc: "AI 검색엔진이 실제로 읽는 서버 응답 HTML에 구조화 데이터가 있는지" },
      { label: "JSON-LD 문법 유효성", desc: "문법 오류가 있으면 해당 블록 전체가 무시됨" },
      { label: "schema.org 컨텍스트 명시", desc: "@context에 schema.org가 올바르게 선언되어 있는지" },
      { label: "발행 주체 엔티티", desc: "Organization 또는 Person으로 콘텐츠 발행 주체를 명시했는지" },
      { label: "웹사이트 엔티티 (WebSite)", desc: "사이트 전체를 대표하는 엔티티가 있는지" },
      { label: "웹페이지 엔티티 (WebPage)", desc: "현재 페이지 자체를 나타내는 엔티티가 있는지" },
      { label: "이동경로 (BreadcrumbList)", desc: "사이트 계층 구조를 보여주는 경로 정보가 있는지" },
      { label: "기대 엔티티", desc: "Article/Product/FAQPage 등 페이지의 실제 주제를 나타내는 구체적 타입이 있는지" },
    ],
  },
  attributeCompleteness: {
    label: "속성 완성도",
    weight: 30,
    icon: "📋",
    items: [
      { label: "발행 주체 필수 속성", desc: "name, url, logo/image, description 등 핵심 속성이 채워져 있는지" },
      { label: "WebSite 필수 속성", desc: "name, url, potentialAction(SearchAction), inLanguage 등이 채워져 있는지" },
      { label: "WebPage 필수 속성", desc: "name, url/@id, description, isPartOf 등이 채워져 있는지" },
      { label: "발행/수정일 속성", desc: "datePublished/dateModified로 최신성 신호를 제공하는지" },
    ],
  },
  entityConnectivity: {
    label: "엔티티 연결성",
    weight: 15,
    icon: "🔗",
    items: [
      { label: "@id 식별자 부여", desc: "주요 엔티티마다 고유하게 참조 가능한 @id가 있는지" },
      { label: "엔티티 간 상호 참조", desc: "WebPage → WebSite, 콘텐츠 → 발행 주체처럼 @id로 서로 연결되는지" },
      { label: "sameAs 외부 신뢰 링크", desc: "위키피디아·위키데이터·공식 SNS 등 외부 권위 있는 소스와 연결되는지" },
    ],
  },
};

export const GEO_GRADE_LEGEND = [
  { range: "90~100점", label: "최우수", status: "good" },
  { range: "70~89점", label: "우수", status: "good" },
  { range: "50~69점", label: "보완 필요", status: "warning" },
  { range: "0~49점", label: "위험", status: "critical" },
];
