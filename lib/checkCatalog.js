// SEO 체크 페이지의 "분석 전 미리보기"에 쓰이는 정적 설명 데이터입니다.
// 실제 채점 로직(lib/analyze.js)과는 별개로, 각 항목이 "무엇을 왜 보는지"를 짧게 설명합니다.
export const CHECK_CATALOG = {
  contentSeo: {
    label: "콘텐츠 SEO",
    weight: 50,
    icon: "📄",
    items: [
      { label: "Title 태그", desc: "검색결과에 표시되는 페이지 제목. 핵심 키워드 포함 필수" },
      { label: "Meta Description", desc: "검색결과 설명문. 클릭률(CTR)에 직접적 영향" },
      { label: "H1 태그 (1개 권장)", desc: "페이지 대표 제목. 검색엔진이 콘텐츠 주제 파악에 활용" },
      { label: "제목 계층 구조", desc: "H1 아래 H2, H3로 이어지는 구조. 가독성과 SEO 향상" },
      { label: "이미지 alt 텍스트", desc: "이미지 검색 노출 및 접근성에 필수" },
      { label: "본문 콘텐츠 분량", desc: "정보량이 충분한지 확인 (권장 300단어 이상)" },
      { label: "내부 링크", desc: "관련 페이지로 연결되는 내부 링크 존재 여부" },
    ],
  },
  technicalSeo: {
    label: "테크니컬 SEO",
    weight: 20,
    icon: "⚙️",
    items: [
      { label: "Canonical 태그", desc: "중복 콘텐츠 방지. 대표 URL을 검색엔진에 명시" },
      { label: "robots.txt 존재/유효성", desc: "크롤러 접근 제어 파일. 크롤링 효율 관리" },
      { label: "sitemap.xml 존재/유효성", desc: "검색엔진 크롤러에게 사이트 구조 제공" },
      { label: "구조화 데이터 (JSON-LD)", desc: "검색 결과 리치 스니펫 노출을 위한 스키마 마크업" },
      { label: "색인 허용 여부 (noindex)", desc: "검색엔진 노출 차단 설정이 없는지 확인" },
      { label: "HTML lang 속성", desc: "페이지의 기본 언어를 명시" },
      { label: "HTML5 Doctype 선언", desc: "브라우저 표준 모드 렌더링 보장" },
    ],
  },
  searchFriendliness: {
    label: "검색엔진 친화도",
    weight: 20,
    icon: "🔍",
    items: [
      { label: "모바일 뷰포트 설정", desc: "모바일 반응형 필수. 모바일 우선 인덱싱 대응" },
      { label: "Favicon 아이콘", desc: "브라우저 탭과 검색결과에 표시되는 사이트 아이콘" },
      { label: "Open Graph 태그", desc: "SNS 공유 시 미리보기, 사이트명 표시" },
      { label: "Twitter Card 태그", desc: "X(트위터) 공유 시 미리보기 최적화" },
      { label: "문자 인코딩(charset) 선언", desc: "올바른 텍스트 렌더링을 위한 필수 선언" },
    ],
  },
  speedOptimization: {
    label: "속도 최적화",
    weight: 10,
    icon: "⚡",
    items: [
      { label: "HTML 문서 크기", desc: "불필요한 마크업 최소화로 로딩 속도 개선" },
      { label: "렌더링 차단 스크립트", desc: "async/defer 사용으로 렌더링 차단 최소화" },
      { label: "이미지 width/height 지정", desc: "레이아웃 밀림(CLS) 방지" },
      { label: "응답 압축 (gzip/br)", desc: "전송 용량 절감으로 로딩 속도 향상" },
      { label: "캐시 설정 (Cache-Control)", desc: "재방문 시 로딩 속도 개선" },
    ],
  },
};

export const GRADE_LEGEND = [
  { range: "90~100점", label: "최우수", status: "good" },
  { range: "70~89점", label: "우수", status: "good" },
  { range: "50~69점", label: "보완 필요", status: "warning" },
  { range: "0~49점", label: "위험", status: "critical" },
];
