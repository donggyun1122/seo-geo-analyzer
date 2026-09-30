// Playwright(헤드리스 브라우저)로 네이버 플레이스 검색 결과를 읽어서 순위를 측정합니다.
//
// 절대 원칙 (요청하신 조건 그대로):
//  - 캡차 자동 풀이, IP 우회(프록시 로테이션), 자동화 탐지 우회 로직을 넣지 않습니다.
//  - 네이버가 접근을 막으면(차단 페이지, 비정상 응답 등) 그대로 status: "blocked"로 보고하고 끝냅니다.
//    다른 방식으로 재시도하거나 우회를 시도하지 않습니다.
//  - 업체 식별은 이름 문자열이 아니라 고유 placeId로만 합니다(아래 이유로 URL이 아니라
//    data-nlog-params에서 뽑습니다).
//
// ✅ 2026-09-30, 실제 라이브 페이지(사용자가 직접 개발자도구로 확인해서 제공한 markup)를
// 기준으로 다음을 확정/수정했습니다:
//  1. 검색 URL이 틀렸었습니다. m.place.naver.com/search?query=... 가 아니라
//     map.naver.com/p/search/<키워드> 가 실제로 결과를 보여주는 주소입니다.
//     (이게 이전에 "결과 목록을 화면에서 찾지 못했어요" 오류의 진짜 원인이었어요 — 아예
//     다른 페이지로 접속하고 있었던 거예요.)
//  2. 결과 항목의 <a> 태그는 href="#"만 갖고 있고(자바스크립트 라우팅 방식), 실제 매장
//     식별자는 URL이 아니라 data-nlog-params 속성의 JSON 안에 place_id로 들어있습니다.
//     예: data-nlog-params='{"item_type":"place_type","item_name":"restaurant",
//     "place_id":"2060110285","rank":4}'
//     그래서 URL에서 뽑던 기존 방식(extractPlaceIdFromUrl)은 검색 결과 파싱에는 애초에
//     쓸 수 없는 방식이었고, 이 파일에서는 더 이상 쓰지 않습니다. (등록 화면에서 사용자가
//     입력하는 네이버 플레이스 URL을 파싱하는 lib/placeRank/extractPlaceId.js는 그 용도가
//     달라서 그대로 유지합니다 — 거기 URL은 실제 상세페이지 링크라 여전히 유효합니다.)
//  3. li[data-laim-exp-id] 부분의 매칭 자체는 원래도 맞았던 것으로 보입니다(속성 존재 자체는
//     확인됨). 다만 클래스명(UEzoS, rTjJo 등)은 자동 생성된 해시로 보여서 신뢰할 수 없다고
//     판단해 selector에 넣지 않았습니다 — data-laim-exp-id 같은 속성 기반 선택이 CSS 클래스
//     보다 안정적입니다.
//
// ✅ 2026-09-30 추가 확인 — 광고(스폰서) 항목의 실제 마크업(사용자가 제공한 실제 광고 li
// outerHTML)도 이제 확인됐습니다:
//  4. 광고 항목도 organic 항목과 똑같이 data-laim-exp-id 속성을 갖고 있습니다(값만 다름 —
//     예: "undefined*e"). 그래서 li[data-laim-exp-id] selector가 광고 항목도 그대로
//     포함해서 가져옵니다(누락되지 않습니다) — 이전에 "광고는 아예 안 걸려서 자연스럽게
//     제외될 수도 있다"고 추측했던 부분은 틀렸던 것으로 확인됐어요.
//  5. 광고인지 여부는 텍스트("광고")만이 아니라, li 안 일부 data-nlog-params JSON에
//     "is_ad":true 가 명시적으로 들어있는 경우가 있습니다(예:
//     {"place_id":"2011848130","rank":2,"is_ad":true,"ad_id":"nad-..."}). 단, li 하나
//     안에 data-nlog-params를 가진 요소가 여러 개 있고, 그 중 첫 번째(예: 상단 이름
//     링크)에는 is_ad 필드가 없는 경우도 있었습니다 — 그래서 이제 li 안의 모든
//     data-nlog-params 요소를 확인해서 하나라도 is_ad:true면 광고로 판단하고, 그렇지
//     않으면 기존처럼 텍스트에 "광고"가 포함되는지(스크린리더용 숨김 텍스트 span 포함)로
//     한 번 더 확인합니다(둘 중 하나라도 맞으면 광고).
//  6. place_id 자체는 광고/organic 여부와 무관하게 항상 존재해서, 이 값으로 대상 업체
//     매칭에는 문제가 없습니다 — computeRank()가 isAd:true인 항목은 순위 계산에서
//     제외하므로(요청하신 대로) 광고로 노출된 자기 업체는 자연 순위에 포함되지 않습니다.
//
// ✅ 2026-09-30 추가 개선 — URL과 placeId 추출을 고쳤는데도 "검색 결과 목록을 화면에서
// 찾지 못했어요" 오류가 계속돼서 추가했습니다:
//  7. map.naver.com(지도 서비스)은 예전부터 검색 결과 목록/리뷰 등을 최상위 문서가 아니라
//     iframe 안에서 렌더링하는 구조로 알려져 있습니다(예: searchIframe, entryIframe 같은
//     이름). Playwright의 page.locator()/page.$$eval()은 기본적으로 메인 프레임 문서만
//     보고 iframe 내부까지 자동으로 뚫고 들어가지 않기 때문에, 실제로는 결과가 화면에 잘
//     보이는데도(사용자가 개발자도구로 요소를 실제로 찾아서 복사할 수 있었죠) 우리 코드는
//     "찾지 못했다"고 판단했을 가능성이 있습니다.
//     ⚠️ 확인 필요: 이 프로젝트를 만드는 환경(샌드박스)에서는 map.naver.com에 직접
//     접속해서 iframe 구조를 확인할 수 없어서, 실제로 iframe이 있는지 100% 검증하지는
//     못했습니다 — 사용자께 개발자도구에서 <iframe> 태그 존재 여부를 확인해달라고
//     요청드렸습니다.
//  8. 그래서 이제 메인 문서뿐 아니라 페이지 안의 모든 프레임(iframe 포함)을 순회하면서
//     RESULT_ITEM_SELECTOR가 실제로 매칭되는 프레임을 찾고, 그 프레임을 기준으로 이후
//     모든 작업(항목 수집, 스크롤)을 수행하도록 바꿨습니다(_findResultFrame()). iframe이
//     없는 경우(모든 게 메인 프레임 안에 있는 경우)에도 정상 동작합니다 — page.frames()의
//     첫 번째 항목이 항상 메인 프레임이라서 기존 동작과 동일하게 찾아집니다.
//
// ⚠️ 아직 확인되지 않은 부분:
//  - 확인된 광고 샘플은 2건뿐이라, 광고 유형(배너형, 다른 업종 등)에 따라 마크업이 달라질
//    가능성은 남아있습니다. is_ad 플래그가 없는 다른 형태의 광고가 나온다면 텍스트("광고")
//    폴백으로 잡히는지 raw_top_results로 한 번 확인해보시는 게 좋아요.
//  - 데스크톱 레이아웃(지도+목록 분할 화면)에서 목록이 페이지 전체가 아니라 별도 스크롤
//    패널 안에 있을 수 있어서, 아래 _collectItems()는 li들을 감싸는 스크롤 가능한 조상
//    요소를 찾아 그 안에서 스크롤하도록 만들었습니다 — 다만 이것도 실제 여러 스크롤 후
//    동작까지 라이브로 검증하지는 못했습니다.
//  - iframe 안에서 찾은 뒤에도 여전히 결과를 못 찾는다면, 그건 iframe 문제가 아니라 다른
//    원인(예: 로딩 시간 부족, 다른 차단 방식, GitHub Actions 실행 서버가 해외 IP라서
//    네이버가 다른 화면을 보여줄 가능성 등)일 수 있어요.
//
// ✅ 2026-09-30 추가 — iframe 대응 이후에도 똑같은 "찾지 못했어요" 오류가 반복돼서,
// 더 이상 추측만으로 selector를 계속 고치는 대신 실제로 그 순간 브라우저가 무엇을 보고
// 있었는지를 오류 메시지에 그대로 남기도록 했습니다(_collectDebugInfo(): 최종 URL, 페이지
// 제목, 본문 앞 200자, iframe 목록 — 비밀값/개인정보는 포함하지 않음). 이 오류가 또
// 발생하면 GitHub Actions 로그의 "[진단정보] ..." 부분을 그대로 알려주시면, 추측이 아니라
// 실제 데이터로 다음 원인을 좁힐 수 있어요(예: 최종 URL이 검색 페이지가 아닌 다른 곳으로
// 리다이렉트됐는지, 본문에 어떤 문구가 있는지, iframe 주소들이 예상과 다른지 등).
//
// ✅ 2026-09-30 — PC는 정상 동작 확인됨. 그런데 모바일(device: "mobile")은 여전히
// 실패해서 원인을 찾아보니, 코드에서 pc/mobile을 가르는 건 User-Agent(기기인 척하는 값)
// 뿐인데, 네이버가 모바일 User-Agent를 보면 아예 다른 사이트로 보낸다는 걸 확인했습니다:
//  9. map.naver.com/p/search/<키워드>로 접속해도, 모바일 User-Agent면 네이버가
//     m.place.naver.com/<업종>/list?query=...&x=...&y=...(예: /restaurant/list)로
//     리다이렉트합니다. 이 주소는 검색어의 업종 분류에 따라 경로가 달라져서(식당이면
//     restaurant, 미용실이면 다른 값 등, 추측 불가) 저희가 직접 만들어 접속하기에는
//     안전하지 않습니다.
//  10. 대신 사용자가 직접 확인해주신 https://m.map.naver.com/search?query=<키워드>
//     (해시 #search 포함)가 업종에 상관없이 쓸 수 있는, PC의 map.naver.com/p/search와
//     같은 역할을 하는 모바일 검색 주소로 확인됐습니다. 그래서 모바일은 이 주소를 씁니다.
//  11. 이 페이지의 결과 항목은 PC와 마크업이 완전히 다릅니다(클래스가 전부 해시라
//     신뢰 불가, data-nlog-params 같은 속성도 없음). 다행히 모바일은 결과 항목의 <a>가
//     href="#" 대신 진짜 상세페이지 링크(https://m.place.naver.com/place/<placeId>/home)를
//     그대로 가지고 있어서, PC처럼 JSON을 파싱할 필요 없이 URL에서 바로 placeId를 뽑을 수
//     있습니다(사용자가 제공한 실제 마크업으로 확인 — place_id: 2060110285).
//     하나의 업체당 이런 링크(썸네일, 이름 등)가 여러 개 있을 수 있어서 중복 제거는
//     그대로 필요합니다. "가격" 버튼 링크(.../menu/list)도 같은 place_id를 포함하고
//     있어서 같이 걸리지만, 중복 제거되니 결과에는 영향 없습니다.
//
// ⚠️ 모바일 관련 확인 필요:
//  - 광고 항목의 실제 마크업 샘플이 아직 없습니다(사용자가 테스트한 키워드에는 광고가
//    안 떴다고 확인해주셨어요). 그래서 지금은 광고 링크 주변 몇 단계 조상 요소의 텍스트에
//    "광고"가 포함되는지로만 판단합니다 — 실제 광고가 있는 키워드로 테스트해보시고
//    raw_top_results에 광고가 organic으로 잘못 섞이지 않는지 확인해주시면 좋겠어요.
//  - a[href*="m.place.naver.com/place/"] selector가 혹시 페이지의 다른 영역(예: "이 근처
//    다른 곳" 같은 추천 위젯)에 있는 링크까지 잘못 잡을 가능성은 배제 못 했습니다 — 실제
//    순위 결과가 화면에서 본 것과 일치하는지 확인해보시는 게 좋아요.
//
// ✅ 2026-09-30 추가 — "키워드 분석"(키워드 하나로 노출되는 업체 목록을 순위/이름/카테고리/
// 주소로 보여주는 기능) 지원을 위해 카테고리/주소 추출을 추가했습니다:
//  12. 모바일 실제 마크업(봉마루집 합정점 샘플)에서 카테고리(<em class="_item_category_...">)와
//      주소(<button class="_item_address_...">주소보기+실제주소 텍스트</button>)가 목록
//      단계에서부터 확인됐습니다. 다만 이 둘은 방금 selector가 잡은 <a> 태그 자신의
//      자식이 아니라 몇 단계 위 조상 아래(형제 가지)에 있어서, 조상을 타고 올라가며
//      찾습니다 — 이때 한 후보(업체)의 범위를 벗어나 옆 업체 것까지 잘못 집어올 위험이
//      있어서, 각 조상 단계에서 후보가 "정확히 1개"일 때만 채택하고(0개면 한 단계 더
//      올라가고, 2개 이상이면 이미 여러 업체가 섞인 범위로 보고 그 자리에서 포기 — null)
//      하는 방식으로 추측을 최소화했습니다.
//  13. PC는 실제 샘플 3건 중 1건("합정 풍윤")에서만 카테고리로 보이는 두 번째 span
//      (class="KCMnt")이 있었고, 나머지 2건에는 없었습니다 — 사용자가 일부만 복사해서
//      그런 건지 실제로 없는 항목이 있는 건지 확인되지 않아 ⚠️ 확인 필요로 남겨두고,
//      없으면 null로 둡니다. 주소는 PC 샘플 3건 어디에도 그런 요소가 없어서(목록 자체가
//      아니라 클릭 후 나오는 상세 패널에만 있을 가능성) 아예 추출을 시도하지 않고 항상
//      null입니다 — 그래서 키워드 분석 기능의 기본값은 모바일입니다(주소까지 필요하면).

const { chromium } = require("playwright");
const { PlaceRankProvider } = require("./PlaceRankProvider");
const { computeRank } = require("./rankExtraction");

const DEFAULT_MAX_RANK = 50;
const NAV_TIMEOUT_MS = 15000;
const MAX_SCROLL_ROUNDS = 12;

const SEARCH_URL_PC = (keyword) => `https://map.naver.com/p/search/${encodeURIComponent(keyword)}`;
// 모바일은 PC와 다른 사이트를 씁니다(맨 위 파일 주석 9~10번 참고) — 업종에 따라 주소가
// 달라지는 m.place.naver.com/<업종>/list 대신, 업종에 상관없이 쓸 수 있는 검색 주소예요.
const SEARCH_URL_MOBILE = (keyword) => `https://m.map.naver.com/search?query=${encodeURIComponent(keyword)}#search`;

// 결과 리스트의 각 항목(li). data-laim-exp-id 속성이 실제 라이브 페이지에서 확인됐어요.
// 나머지 두 개(#_pcmap_list_scroll_container, ul#_list)는 예전 m.place 레이아웃 기준으로
// 추측했던 값이라 지금은 안 맞을 가능성이 높지만, 매칭 안 되면 그냥 무시되니 안전하게 남겨둡니다.
const RESULT_ITEM_SELECTOR_PC = "li[data-laim-exp-id], #_pcmap_list_scroll_container li, ul#_list > li";
// 모바일은 li 등을 감싸는 요소에 신뢰할 만한 속성이 없어서(클래스는 전부 해시), 대신 각
// 업체 상세페이지로 가는 실제 링크(href)를 직접 찾습니다(맨 위 파일 주석 11번 참고).
const RESULT_ITEM_SELECTOR_MOBILE = 'a[href*="m.place.naver.com/place/"]';
const AD_LABEL_TEXT = "광고";
// 네이버가 자동화 요청을 감지했을 때 보통 노출하는 문구들 — 발견되면 즉시 "blocked" 처리.
const BLOCK_INDICATORS = [
  "자동화된 요청",
  "비정상적인 접근",
  "일시적으로 제한",
  "captcha",
  "로봇이 아닙니다",
  "이용에 불편을 드려",
];

// 이 두 함수는 Playwright의 $$eval을 통해 브라우저(페이지) 안에서 그대로 실행됩니다.
// $$eval은 함수를 toString()으로 직렬화해서 브라우저 쪽에서 다시 평가하기 때문에, 클래스
// 메서드(특히 static 메서드)로 두면 "static foo(...) {...}" 형태라 독립된 함수 표현식으로
// 재평가할 수 없어 에러가 납니다 — 그래서 일반 top-level 함수로 뒀습니다. 이 함수들은
// 바깥(Node.js) 쪽 변수를 참조하지 않고 매개변수(nodes, adLabel)와 브라우저 DOM API만
// 사용합니다.

// PC 전용 추출 로직: placeId와 광고 여부를 href가 아니라 data-nlog-params 속성들의
// JSON에서 뽑습니다(맨 위 파일 주석 1~6번 참고).
function extractBatchPc(nodes, adLabel) {
  return nodes.map((node) => {
    let placeId = null;
    let isAdFromParams = false;
    const paramNodes = node.querySelectorAll("[data-nlog-params]");
    paramNodes.forEach((el) => {
      try {
        const parsed = JSON.parse(el.getAttribute("data-nlog-params"));
        if (parsed) {
          if (!placeId && parsed.place_id) placeId = String(parsed.place_id);
          if (parsed.is_ad === true) isAdFromParams = true;
        }
      } catch (e) {
        // 형식이 예상과 다르면 이 요소만 건너뜁니다(추측해서 값을 만들지 않음).
      }
    });
    const nameEl = node.querySelector("[class*='name'], span, strong");
    const name = (nameEl ? nameEl.textContent : node.textContent || "").trim().slice(0, 60);
    // 카테고리로 보이는 두 번째 span(class="KCMnt") — 확인된 샘플 1건 기준, 다른 샘플에는
    // 없어서 ⚠️ 확인 필요. 없으면 추측하지 않고 null.
    const categoryEl = node.querySelector("[class*='KCMnt']");
    const category = categoryEl ? categoryEl.textContent.trim().slice(0, 40) : null;
    // ⚠️ 확인 필요: PC 목록 샘플 어디에도 주소로 보이는 요소가 없어서 추출을 시도하지 않고
    // 항상 null입니다(파일 위쪽 주석 13번 참고).
    const address = null;
    // is_ad 플래그를 우선 신뢰하고, 없으면 텍스트에 "광고"가 포함되는지로 보조
    // 판단합니다(스크린리더용 숨김 텍스트 span도 textContent에는 포함됩니다).
    const isAd = isAdFromParams || (node.textContent || "").includes(adLabel);
    return { placeId, name, category, address, isAd };
  });
}

// 모바일 전용 추출 로직: node 자체가 상세페이지로 가는 <a> 태그입니다(맨 위 파일 주석
// 9~11번 참고). href에서 바로 placeId를 뽑을 수 있어서 PC보다 단순합니다. 광고 여부는
// 확인된 샘플이 없어서(⚠️ 확인 필요) 가까운 조상 몇 단계의 텍스트에 "광고"가 있는지로만
// 판단합니다 — 너무 많이 올라가면 옆에 있는 다른 업체까지 광고로 잘못 판단할 수 있어서
// 3단계까지만 확인합니다.
function extractBatchMobile(nodes, adLabel) {
  // node(하나의 <a>)만으로는 카테고리/주소에 닿지 않는 경우가 있어서(썸네일·가격 링크는
  // 이름/카테고리/주소가 있는 가지와 다른 형제 가지에 있음 — 파일 위쪽 주석 12번 참고),
  // 조상을 한 단계씩 올라가며 classSubstring이 포함된 요소를 찾습니다. 이 함수는 $$eval로
  // 브라우저에 그대로 직렬화돼야 해서(맨 위 주석 참고) extractBatchMobile 안에 중첩
  // 함수로 둡니다 — 바깥의 별도 top-level 함수를 참조하면 브라우저 쪽에서 찾을 수 없어요.
  function findSingleAncestorMatch(startNode, maxLevels, classSubstring) {
    let el = startNode;
    for (let i = 0; i < maxLevels; i++) {
      el = el && el.parentElement;
      if (!el) return null;
      const all = el.querySelectorAll("*");
      let found = null;
      let count = 0;
      for (let j = 0; j < all.length; j++) {
        const cls = all[j].className;
        if (typeof cls === "string" && cls.indexOf(classSubstring) !== -1) {
          count++;
          found = all[j];
          if (count > 1) break;
        }
      }
      // 이 조상 단계에서 후보가 정확히 1개면 채택, 0개면 한 단계 더 올라가고, 2개 이상이면
      // 이미 옆 업체 것까지 섞인 범위로 보고 추측하지 않고 포기합니다(null).
      if (count === 1) return found;
      if (count > 1) return null;
    }
    return null;
  }

  return nodes.map((node) => {
    const href = node.getAttribute("href") || "";
    const match = href.match(/\/place\/(\d+)/);
    const placeId = match ? match[1] : null;
    const nameEl = node.querySelector("[class*='name'], strong");
    const name = (nameEl ? nameEl.textContent : node.textContent || "").trim().slice(0, 60);

    const categoryEl = findSingleAncestorMatch(node, 6, "_item_category");
    const category = categoryEl ? categoryEl.textContent.trim().slice(0, 40) : null;

    const addressEl = findSingleAncestorMatch(node, 6, "_item_address");
    let address = null;
    if (addressEl) {
      // 버튼 안에 "주소보기" 아이콘 텍스트가 섞여 있어서(실제 샘플 확인), 그 자식 요소의
      // 텍스트는 빼고 버튼의 직접 텍스트 노드만 모읍니다.
      let text = "";
      addressEl.childNodes.forEach((n) => {
        if (n.nodeType === 3) text += n.textContent;
      });
      address = text.trim().slice(0, 120) || null;
    }

    let isAd = false;
    let anc = node;
    for (let i = 0; i < 3 && anc; i++) {
      if ((anc.textContent || "").includes(adLabel)) {
        isAd = true;
        break;
      }
      anc = anc.parentElement;
    }
    return { placeId, name, category, address, isAd };
  });
}

class PlaywrightPlaceRankProvider extends PlaceRankProvider {
  constructor(options = {}) {
    super();
    this.headless = options.headless !== false;
    this.userAgentMobile =
      options.userAgentMobile ||
      "Mozilla/5.0 (Linux; Android 10; SM-G970N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    this.userAgentDesktop =
      options.userAgentDesktop ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  async checkRank({ keyword, device = "mobile", targetPlaceId, maxRank = DEFAULT_MAX_RANK, searchLocation }) {
    if (!keyword || !keyword.trim()) {
      return { status: "error", rank: null, maxRankChecked: null, errorMessage: "keyword는 필수예요." };
    }
    if (!targetPlaceId) {
      return { status: "error", rank: null, maxRankChecked: null, errorMessage: "targetPlaceId는 필수예요." };
    }
    // ⚠️ 확인 필요: searchLocation(검색 기준 위치)은 매개변수로 받아서 Supabase에는 그대로
    // 저장되지만, 아래 SEARCH_URL_PC/SEARCH_URL_MOBILE이 실제로 이 값을 네이버 검색
    // 요청에 반영하지는 않아요.
    // 네이버 플레이스 검색이 위치를 좌표(예: &x=...&y=...)나 다른 공식 파라미터로 받는지
    // 확실히 검증된 바가 없어서, 근거 없는 파라미터를 추측해서 넣지 않았습니다. 즉 지금은
    // "검색 위치"를 다르게 입력해도 실제 검색 결과(따라서 순위)에는 차이가 없어요 — 검증된
    // 방식을 확인하기 전까지는 이 상태를 유지하는 게, 틀린 결과를 그럴듯하게 보여주는 것보다
    // 낫다고 판단했습니다.

    const searchResult = await this._runSearch({ keyword, device, maxRank });
    if (searchResult.status === "blocked") {
      return { status: "blocked", rank: null, maxRankChecked: null, errorMessage: searchResult.errorMessage };
    }
    if (searchResult.status === "error") {
      return { status: "error", rank: null, maxRankChecked: null, errorMessage: searchResult.errorMessage };
    }

    const items = searchResult.items;
    const { found, rank, totalOrganicScanned } = computeRank(items, targetPlaceId);
    // 주의: idx + 1을 그대로 쓰면 광고가 목록 중간에 끼어 있을 때 자연 노출 순위가 밀려서
    // 틀리게 표시돼요(예: [광고, 매장A, 매장B]에서 매장A는 2위가 아니라 자연 노출 1위).
    // computeRank()가 계산하는 순위와 같은 기준으로 광고를 건너뛰고 별도 카운터로 매겨요.
    let organicRank = 0;
    const topResults = items.map((it) => {
      if (it.isAd) {
        return { placeId: it.placeId, name: it.name, rank: null, isAd: true };
      }
      organicRank += 1;
      return { placeId: it.placeId, name: it.name, rank: organicRank, isAd: false };
    });

    if (found) {
      return { status: "ok", rank, maxRankChecked: totalOrganicScanned, errorMessage: null, topResults };
    }
    return {
      status: "not_found",
      rank: null,
      maxRankChecked: totalOrganicScanned,
      errorMessage: `상위 ${totalOrganicScanned}위(광고 제외) 안에서 매장을 찾지 못했어요. 그보다 낮은 순위이거나, 이 키워드로는 노출되지 않을 수 있어요.`,
      topResults,
    };
  }

  // 2026-09-30 추가 — "키워드 분석" 기능(특정 매장을 찾는 게 아니라, 키워드 하나로 노출되는
  // 업체 목록 자체를 순위/이름/카테고리/주소로 보여주는 기능)용. checkRank와 달리
  // targetPlaceId가 필요 없고, 찾은 업체를 전부(최대 maxRank개) 반환합니다. 실제 브라우저
  // 탐색 로직(_runSearch)은 checkRank와 완전히 동일한 코드를 공유해서, 이미 라이브
  // 검증된 PC/모바일 동작(URL, iframe 대응, 진단정보 등)이 그대로 적용됩니다.
  async listPlaces({ keyword, device = "mobile", maxRank = DEFAULT_MAX_RANK }) {
    if (!keyword || !keyword.trim()) {
      return { status: "error", items: [], errorMessage: "keyword는 필수예요." };
    }

    const searchResult = await this._runSearch({ keyword, device, maxRank });
    if (searchResult.status !== "ok") {
      return { status: searchResult.status, items: [], errorMessage: searchResult.errorMessage };
    }

    let organicRank = 0;
    const items = searchResult.items.map((it) => {
      if (it.isAd) {
        return { rank: null, placeId: it.placeId, name: it.name, category: it.category || null, address: it.address || null, isAd: true };
      }
      organicRank += 1;
      return { rank: organicRank, placeId: it.placeId, name: it.name, category: it.category || null, address: it.address || null, isAd: false };
    });

    return { status: "ok", items, errorMessage: null };
  }

  // checkRank와 listPlaces가 공유하는 실제 브라우저 탐색 로직입니다(2026-09-30 리팩터 —
  // 동작 자체는 예전 checkRank 안에 있던 코드 그대로이고, 위치만 옮겼습니다).
  // 반환: { status: 'ok', items } | { status: 'blocked'|'error', errorMessage }
  async _runSearch({ keyword, device, maxRank }) {
    let browser = null;
    try {
      browser = await chromium.launch({ headless: this.headless });
      const context = await browser.newContext({
        userAgent: device === "pc" ? this.userAgentDesktop : this.userAgentMobile,
        viewport: device === "pc" ? { width: 1366, height: 900 } : { width: 390, height: 844 },
        locale: "ko-KR",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(NAV_TIMEOUT_MS);

      const searchUrl = device === "pc" ? SEARCH_URL_PC(keyword) : SEARCH_URL_MOBILE(keyword);
      const resultSelector = device === "pc" ? RESULT_ITEM_SELECTOR_PC : RESULT_ITEM_SELECTOR_MOBILE;

      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

      const bodyText = await page.evaluate(() => document.body.innerText || "").catch(() => "");
      const blocked = BLOCK_INDICATORS.some((needle) => bodyText.includes(needle));
      if (blocked) {
        return {
          status: "blocked",
          errorMessage: "네이버가 자동화된 접근으로 판단해 결과를 제한했어요. (우회하지 않고 이번 측정은 실패로 기록합니다.)",
        };
      }

      // 메인 문서뿐 아니라 iframe 안에도 결과가 있을 수 있어서(맨 위 파일 주석의 7번 참고),
      // 페이지 안의 모든 프레임을 확인해서 실제로 결과가 매칭되는 프레임을 찾습니다.
      const resultFrame = await this._findResultFrame(page, resultSelector, NAV_TIMEOUT_MS);
      if (!resultFrame) {
        // 같은 오류가 여러 번 반복돼서, 더 이상 추측으로 selector/URL을 계속 고치기보다
        // 실제로 그 순간 브라우저가 뭘 보고 있었는지를 그대로 남겨서(진단정보) 다음
        // 원인을 정확히 좁힐 수 있게 했습니다. 개인정보나 비밀값은 포함하지 않습니다
        // (페이지의 최종 URL/제목/본문 앞부분/iframe 목록만 남겨요).
        const debugInfo = await this._collectDebugInfo(page, bodyText);
        return {
          status: "error",
          errorMessage:
            `검색 결과 목록을 화면에서 찾지 못했어요(페이지 안의 모든 프레임을 확인했어요). 네이버 페이지 구조가 바뀌었을 수 있어요 — RESULT_ITEM_SELECTOR를 실제 페이지 기준으로 다시 확인해주세요. [진단정보] ${debugInfo}`,
        };
      }

      const items = await this._collectItems(page, resultFrame, maxRank, device);
      return { status: "ok", items };
    } catch (err) {
      return { status: "error", errorMessage: err && err.message ? err.message : String(err) };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  // 결과를 못 찾았을 때, 그 순간 브라우저가 실제로 뭘 보고 있었는지 남깁니다(개인정보나
  // 비밀값은 다루지 않는 값들만 — 최종 URL, 페이지 제목, 본문 앞부분, iframe 목록).
  // GitHub Actions 로그(및 Supabase의 error_message 컬럼)에 그대로 남아서, 다음에 같은
  // 오류가 나면 추측 대신 이 정보를 보고 원인을 좁힐 수 있습니다.
  async _collectDebugInfo(page, bodyText) {
    try {
      const finalUrl = page.url();
      const title = await page.title().catch(() => "");
      const frames = page.frames();
      const frameUrls = frames.map((f) => f.url()).slice(0, 8);
      const bodySnippet = (bodyText || "").replace(/\s+/g, " ").trim().slice(0, 200);
      return JSON.stringify({
        finalUrl,
        title,
        frameCount: frames.length,
        frameUrls,
        bodySnippet,
      });
    } catch (e) {
      return `(진단 정보 수집 자체가 실패했습니다: ${e && e.message ? e.message : String(e)})`;
    }
  }

  // 페이지 안의 모든 프레임(메인 문서 + iframe들)을 돌면서 RESULT_ITEM_SELECTOR가 실제로
  // 매칭되는 프레임을 찾습니다. iframe이 없는 일반적인 경우에는 page.frames()의 첫 번째가
  // 메인 프레임이라 기존과 동일하게 동작해요. 최대 timeoutMs만큼 짧은 간격으로 재시도합니다
  // (results가 늦게 렌더링되는 경우까지 감안).
  async _findResultFrame(page, selector, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const frames = page.frames();
      for (const frame of frames) {
        try {
          const count = await frame.locator(selector).count();
          if (count > 0) return frame;
        } catch (e) {
          // 분리(detached)됐거나 접근할 수 없는 프레임은 건너뜁니다.
        }
      }
      if (Date.now() >= deadline) return null;
      await page.waitForTimeout(300);
    }
  }

  // 무한 스크롤 목록에서 최대 maxRank개까지 아이템을 모읍니다. frame은 실제로 결과가 있는
  // 프레임(메인 문서일 수도, iframe일 수도 있음)이고, page는 waitForTimeout 호출에만
  // 씁니다(Frame에는 waitForTimeout이 없어요). device에 따라 selector와 추출 로직이
  // 다릅니다(PC/모바일이 완전히 다른 사이트라서 — 맨 위 파일 주석 참고).
  // 스크롤 사이의 짧은 대기는 "로딩을 기다리는 것"이지 차단 우회를 위한 것이 아닙니다.
  async _collectItems(page, frame, maxRank, device) {
    const items = [];
    const seen = new Set();
    let stableRounds = 0;
    let round = 0;

    const selector = device === "pc" ? RESULT_ITEM_SELECTOR_PC : RESULT_ITEM_SELECTOR_MOBILE;
    const extractFn = device === "pc" ? extractBatchPc : extractBatchMobile;

    while (items.length < maxRank && stableRounds < 3 && round < MAX_SCROLL_ROUNDS) {
      round++;
      const batch = await frame.$$eval(selector, extractFn, AD_LABEL_TEXT).catch(() => []);

      let added = 0;
      for (const raw of batch) {
        const placeId = raw.placeId;
        if (!placeId) continue;
        if (seen.has(placeId)) {
          // 같은 업체를 가리키는 링크가 여러 개 있을 수 있는데(예: 모바일의 썸네일 링크는
          // 이름이 없고, 이름 링크가 나중에 나옵니다 — 사용자가 제공한 실제 마크업으로
          // 확인했어요), 먼저 잡힌 링크에 이름이 비어있고 나중 링크에 이름이 있으면
          // 채워줍니다. 순위(rank)는 처음 등장한 순서 그대로 유지해서 영향 없습니다.
          if (raw.name) {
            const existing = items.find((it) => it.placeId === placeId);
            if (existing && !existing.name) existing.name = raw.name;
          }
          continue;
        }
        seen.add(placeId);
        items.push({ placeId, name: raw.name, isAd: raw.isAd });
        added++;
        if (items.length >= maxRank) break;
      }

      stableRounds = added === 0 ? stableRounds + 1 : 0;
      if (items.length >= maxRank) break;

      // 목록이 페이지 전체 스크롤이 아니라 별도 스크롤 패널(데스크톱 지도+목록 분할 화면 등) 안에
      // 있을 수 있어서, 결과 항목을 감싸는 스크롤 가능한 조상 요소를 찾아 그 안에서 스크롤합니다.
      // 그런 조상을 못 찾으면 기존처럼 window 전체를 스크롤합니다(모바일 레이아웃 등).
      // ⚠️ 확인 필요: 이 스크롤 경로가 실제로 여러 라운드 동작하는지까지는 라이브로 검증하지
      // 못했습니다.
      await frame
        .evaluate((sel) => {
          const first = document.querySelector(sel);
          if (!first) {
            window.scrollBy(0, 1400);
            return;
          }
          let el = first.parentElement;
          while (el && el !== document.body) {
            if (el.scrollHeight > el.clientHeight + 10) {
              el.scrollTop += 1400;
              return;
            }
            el = el.parentElement;
          }
          window.scrollBy(0, 1400);
        }, selector)
        .catch(() => {});
      await page.waitForTimeout(700);
    }

    return items;
  }
}

module.exports = { PlaywrightPlaceRankProvider };
