// Playwright(헤드리스 브라우저)로 네이버 파워링크(검색광고) "광고 더보기" 페이지를 열어서,
// 키워드 검색 시 노출되는 광고 업체/광고 문안/이미지 등 소재를 정리합니다.
//
// 절대 원칙 (다른 기능과 동일):
//  - 캡차 자동 풀이, IP 우회, 자동화 탐지 우회 로직을 넣지 않습니다. 네이버가 막으면
//    status: "blocked"로 정직하게 기록하고 끝냅니다.
//  - 광고 링크(ader.naver.com 추적 URL)는 절대 클릭하거나 따라가지 않습니다. 광고 링크를 열면
//    광고주에게 실제 클릭 비용이 청구될 수 있어서, 페이지에 보이는 정보(DOM)만 읽습니다.
//    화면에서도 추적 URL 대신 광고의 실제 랜딩 도메인으로만 링크합니다.
//
// ✅ 2026-10-01 — 사용자가 개발자도구로 복사해서 제공한 실제 광고 li(키워드 "호텔예약",
// 트립닷컴 광고 1건)를 기준으로 작성했고, 이 파일의 extractAdBatch()를 실제 Chromium에서
// 그 마크업에 그대로 돌려서 아래 값들이 정확히 뽑히는 것까지 확인했습니다:
//  1. 광고 1건 = <li class="lst ...">. 하위 링크 목록(ul.lst_link 안의 li.item)은 class가
//     "item"이라 광고 항목과 섞이지 않습니다. 혹시 다른 li.lst가 있어도 .tit_wrap/.url_area가
//     없는 항목은 광고가 아닌 것으로 보고 건너뜁니다.
//  2. 광고주명 = .url_area .site, 표시 URL = .url_area .url, 파비콘 = .icon_favicon
//  3. 제목 = .tit_wrap 안의 .lnk_tit 들 — 첫 번째가 메인 제목, 나머지는 서브타이틀
//     (li에 type_subtitle 클래스가 있는 광고)
//  4. 설명 = .desc_area .link_desc
//  5. 이미지 소재 = .ad_thumb img (li에 type_image 클래스가 있는 광고)
//  6. 확장소재(예: [할인] 트립닷컴 단독 특가 확인!) = .link_ext_desc 안의 .prefix_ext/.title_ext,
//     li의 data-promotion 속성("할인")
//  7. 서브링크 = .lst_link .link, 배지(네이버페이 등) = .ico_area .sp_nad
//  8. 광고집행기간 = .period_area .txt (예: "61개월 이상")
//  9. 광고 ID = onclick 속성 안의 "nad-..." 값, 실제 랜딩 주소 = favicon 링크 onclick의
//     urlencode("https://kr.trip.com/") 값
//
// ⚠️ 아직 확인되지 않은 부분(라이브 실행으로 확인 필요):
//  - 확인한 샘플은 광고 1건뿐이라, 이미지/서브타이틀/확장소재가 없는 광고나 다른 형태의
//    광고(예: 가격 정보형, 전화번호형 확장소재 등)는 해당 칸이 비어서 나올 수 있어요
//    (없는 값을 추측해서 채우지 않습니다).
//  - 화면 구조가 다른 경우를 대비해, 광고를 하나도 못 찾으면 추측으로 채우지 않고 "광고를 찾지
//    못함(empty)" + [진단정보](광고 링크 개수, 그 링크를 감싼 li의 class 등)를 남깁니다.
//
// ✅ 2026-10-01 모바일(m.ad.search.naver.com, where=m_expd) — 대장님이 제공한 실제 모바일 광고 li
// (키워드 "호텔예약", 호텔스컴바인 광고 1건)로 확인했어요. PC와 다른 점:
//  10. 광고 1건 = <li class="list_item ..."> (PC는 li.lst) — 그래서 selector가 둘 다 잡습니다.
//  11. 제목 = .tit_area .tit (PC는 .lnk_tit). ⚠️ 같은 li 안의 광고집행기간 라벨도 class가 "tit"라서
//      반드시 .tit_area 안에서만 찾습니다.
//  12. 표시 URL = .url_area .url_link (PC는 a.url). 모바일의 .url은 파비콘·광고주명·URL·아이콘을
//      전부 감싸는 div라서 그대로 쓰면 "호텔스컴바인 hotelscombined.co.kr/ 네이버로그인"처럼 섞여요.
//  13. 설명 = .desc_area .desc (PC는 .link_desc)
//  14. 이미지 소재 = 이미지형 서브링크(.img_wrap .menu_area — 이미지 + "최적가 확인" 같은 문구 3개).
//      PC의 단일 썸네일(.ad_thumb)과 달라서 imageSublinks로 따로 담습니다.
//  15. 배지 = .tit_ico .sp_powerlink (예: "네이버로그인"), PC는 .ico_area .sp_nad
//  16. 실제 랜딩 주소가 들어있는 goOtherCR(urlencode(...))가 모바일엔 없어서, 표시 URL 앞에
//      https://를 붙여서 연결합니다.
//  ⚠️ li에 type_subtitle / ext_desc 클래스가 있었지만 이 샘플에는 서브타이틀/확장소재 요소가 따로
//     보이지 않았어요 — 그래서 모바일 서브타이틀은 .tit_area 안에 .tit가 2개 이상일 때만, 확장소재는
//     PC와 같은 요소가 있을 때만 채워요(추측해서 만들지 않음).
//
// ✅ 2026-10-01 페이지 넘김(PC): 대장님이 확인해주신 대로 주소 뒤에 &pagingIndex=2, 3 ... 을 붙여서
//    "전체 결과"를 모읍니다. 모바일은 페이지가 아니라 목록 아래 "더보기" 버튼으로 이어 붙는 구조라
//    그 버튼을 눌러가며 모아요(_collectMobile — 아래 참고). 끝 페이지 판단은 추측하지 않고 결과로만 합니다 — 그 페이지에서
//    광고를 하나도 못 찾았거나, 새 광고(광고 ID 기준) 없이 이전 페이지와 같은 광고만 나오면
//    거기서 멈춥니다. 페이지 사이에는 짧은 간격(PAGE_DELAY_MS)을 둡니다(예의상 간격이지 우회가
//    아니에요). 혹시 중간 페이지에서 차단되면, 그때까지 모은 광고는 살려서 보여주고 "몇 페이지에서
//    멈췄는지"를 같이 기록합니다.
//  - GitHub Actions 서버에서 접속했을 때도 이 페이지가 차단 없이 열리는지는 실제 실행으로
//    확인해야 해요(대장님 브라우저에서는 차단되지 않는 것을 확인해주셨어요).

const { chromium } = require("playwright");
const { adSiteKey } = require("./siteMatch");

const NAV_TIMEOUT_MS = 20000;
const RESULT_WAIT_MS = 8000;
const PAGE_DELAY_MS = 1500;
// 안전 상한 — 실제로는 광고가 더 안 나오는 페이지에서 먼저 멈춥니다.
const MAX_PAGES = 20;

// PC: 대장님이 확인해주신 광고 더보기 주소 / 모바일: 대장님이 확인해주신 m_expd 주소
// 2페이지부터는 뒤에 &pagingIndex=N 을 붙입니다(1페이지는 원래 주소 그대로).
function buildSearchUrl(keyword, device, pageIndex) {
  const base =
    device === "mobile"
      ? `https://m.ad.search.naver.com/search.naver?where=m_expd&query=${encodeURIComponent(keyword)}`
      : `https://ad.search.naver.com/search.naver?where=ad&query=${encodeURIComponent(keyword)}`;
  return pageIndex > 1 ? `${base}&pagingIndex=${pageIndex}` : base;
}

const USER_AGENT_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// 플레이스 순위 기능에서 쓰는 것과 같은 모바일 User-Agent
const USER_AGENT_MOBILE =
  "Mozilla/5.0 (Linux; Android 10; SM-G970N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// PC: li.lst / 모바일: li.list_item (둘 다 실제 마크업으로 확인)
const AD_ITEM_SELECTOR = "li.lst, li.list_item";

const BLOCK_INDICATORS = [
  "자동화된 요청",
  "비정상적인 접근",
  "일시적으로 제한",
  "captcha",
  "보안 확인을 완료해 주세요",
  "로봇이 아닙니다",
  "이용에 불편을 드려",
];

// Playwright의 $$eval로 브라우저 안에서 그대로 실행되는 함수입니다. toString()으로 직렬화돼서
// 브라우저에서 다시 평가되기 때문에, 바깥(Node) 변수를 참조하지 않고 필요한 보조 함수는
// 전부 이 함수 안에 중첩해서 둡니다.
function extractAdBatch(nodes) {
  function clean(el) {
    if (!el) return null;
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return t || null;
  }

  const out = [];
  nodes.forEach((node, domIndex) => {
    const titWrap = node.querySelector(".tit_wrap");
    const urlArea = node.querySelector(".url_area");
    if (!titWrap && !urlArea) return; // 광고 항목이 아님

    const dataIndexAttr = node.getAttribute("data-index");
    const dataIndex = dataIndexAttr !== null && /^\d+$/.test(dataIndexAttr) ? parseInt(dataIndexAttr, 10) : null;

    // 광고 ID와, 네이버가 클릭 추적 코드에 직접 넣어둔 순위 번호
    // ✅ 대장님이 준 PC 2페이지 첫 광고로 확인: 같은 광고 안에서도 숫자의 의미가 달라요.
    //  - goOtherCR(... "r=26&i=nad-...") 의 r=  → 전체 기준 순위(2페이지 첫 광고 = 26)  ← 이걸 씁니다
    //  - clickcr(this,"sct.tit"/"sct.url"/"sct.desc","nad-...","1",event) → 페이지 안 순위(페이지마다 1부터)
    //  - li의 data-index="0" → 페이지 안 0부터 시작하는 번호
    //  모바일: nclk(this, 'sct.title', 'nad-...', 17) — 따옴표 없는 숫자. ✅ 더보기를 누른 뒤 나온 실제
    //  광고(몬스마리양평)가 17이었어서, 더보기로 이어져도 전체 기준 순위로 이어지는 것을 확인했어요.
    let adId = null;
    let overallRank = null; // PC r=
    let nclkRank = null; // 모바일 nclk 숫자
    let pageRank = null; // PC 제목 clickcr 숫자(페이지 안 순위)
    const clickEls = node.querySelectorAll("[onclick]");
    for (let i = 0; i < clickEls.length; i++) {
      const oc = clickEls[i].getAttribute("onclick") || "";
      const m = oc.match(/nad-[A-Za-z0-9-]+/);
      if (m && !adId) adId = m[0];
      if (overallRank === null) {
        const r = oc.match(/[?&"]r=(\d+)&(?:amp;)?i=nad-/);
        if (r) overallRank = parseInt(r[1], 10);
      }
      if (nclkRank === null) {
        const r = oc.match(/nclk\([^)]*'nad-[A-Za-z0-9-]+'\s*,\s*(\d+)\s*\)/);
        if (r) nclkRank = parseInt(r[1], 10);
      }
      if (pageRank === null) {
        const r = oc.match(/"sct\.tit"\s*,\s*"nad-[A-Za-z0-9-]+"\s*,\s*"(\d+)"/);
        if (r) pageRank = parseInt(r[1], 10);
      }
    }
    const naverRank = overallRank !== null ? overallRank : nclkRank;

    const advertiser = clean(node.querySelector(".url_area .site"));
    // 모바일 .url_link → PC a.url 순서(모바일의 .url은 여러 요소를 감싼 div라 쓰면 안 됨)
    const displayUrl = clean(node.querySelector(".url_area .url_link")) || clean(node.querySelector(".url_area a.url"));

    // 실제 랜딩 주소 — 추적 URL(ader.naver.com)이 아니라 favicon 링크 onclick 안의 원래 도메인
    let landingUrl = null;
    const fav = node.querySelector(".url_area .favicon_wrap");
    if (fav) {
      const m = (fav.getAttribute("onclick") || "").match(/urlencode\("(https?:\/\/[^"]+)"\)/);
      if (m) landingUrl = m[1];
    }
    // 표시 URL로 링크를 만들되, 플레이스 랜딩 광고(표시 URL이 m.place.naver.com/accommodation,
    // map.naver.com/p 처럼 업체 ID 없는 공용 주소)는 엉뚱한 페이지로 연결되니 만들지 않아요.
    if (!landingUrl && displayUrl && !/(^|\.)(place\.naver\.com|map\.naver\.com)/i.test(displayUrl.replace(/^https?:\/\//, ""))) {
      landingUrl = "https://" + displayUrl.replace(/^https?:\/\//, "").replace(/\s+/g, "");
    }

    const faviconEl = node.querySelector(".icon_favicon");
    const favicon = faviconEl ? faviconEl.getAttribute("src") || faviconEl.getAttribute("data-lazysrc1") : null;

    // 제목: PC .lnk_tit / 모바일 .tit_area .tit (첫 번째 = 메인 제목, 나머지 = 서브타이틀)
    let titles = titWrap ? Array.from(titWrap.querySelectorAll(".lnk_tit")).map(clean).filter(Boolean) : [];
    if (!titles.length) titles = Array.from(node.querySelectorAll(".tit_area .tit")).map(clean).filter(Boolean);
    const headline = titles[0] || clean(node.querySelector(".tit_area")) || null;
    const subtitles = titles.slice(1);

    const description =
      clean(node.querySelector(".desc_area .link_desc")) ||
      clean(node.querySelector(".desc_area .desc")) ||
      clean(node.querySelector(".desc_area"));

    const imgEl = node.querySelector(".ad_thumb img");
    const imageUrl = imgEl ? imgEl.getAttribute("src") : null;

    // 플레이스형 광고(li.ext_place — PC 2페이지 샘플로 확인): 업체 사진 여러 장 + 가격/리뷰 정보
    const placeImages = Array.from(node.querySelectorAll(".place_image img"))
      .map((im) => im.getAttribute("src") || im.getAttribute("data-lazysrc1"))
      .filter(Boolean);
    const placeInfoEl = node.querySelector(".place_info");
    const placeInfo = placeInfoEl
      ? {
          price: clean(placeInfoEl.querySelector(".price")),
          items: Array.from(placeInfoEl.querySelectorAll(".etc_area .item")).map(clean).filter(Boolean),
        }
      : null;

    const extEl = node.querySelector(".link_ext_desc");
    const extension = extEl
      ? { label: clean(extEl.querySelector(".prefix_ext")), text: clean(extEl.querySelector(".title_ext")) }
      : null;

    const sublinks = Array.from(node.querySelectorAll(".lst_link .link")).map(clean).filter(Boolean);
    // 이미지형 서브링크(모바일 샘플에서 확인): 이미지 + 문구 묶음
    const imageSublinks = Array.from(node.querySelectorAll(".img_wrap .menu_area"))
      .map((m) => {
        const im = m.querySelector(".menu_img img");
        return { text: clean(m.querySelector(".menu_txt")), imageUrl: im ? im.getAttribute("src") || im.getAttribute("data-lazysrc1") : null };
      })
      .filter((x) => x.text || x.imageUrl);
    const badges = Array.from(node.querySelectorAll(".ico_area .sp_nad, .tit_ico .sp_powerlink")).map(clean).filter(Boolean);
    const adPeriod = clean(node.querySelector(".period_area .txt"));
    const promotion = node.getAttribute("data-promotion") || null;
    const adFormats = Array.from(node.classList).filter(
      (c) => c.indexOf("type_") === 0 || c.indexOf("ext_") === 0 || c.indexOf("sublink_") === 0
    );

    out.push({
      domIndex,
      dataIndex,
      adId,
      naverRank,
      pageRank,
      advertiser,
      displayUrl,
      landingUrl,
      favicon,
      headline,
      subtitles,
      description,
      imageUrl,
      placeImages,
      placeInfo: placeInfo && (placeInfo.price || placeInfo.items.length) ? placeInfo : null,
      extension: extension && (extension.label || extension.text) ? extension : null,
      sublinks,
      imageSublinks,
      badges,
      adPeriod,
      promotion,
      adFormats,
    });
  });
  return out;
}

class PlaywrightSearchAdProvider {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    // 테스트용 — 실제 실행에서는 쓰지 않고 항상 buildSearchUrl(네이버 광고 주소)을 씁니다.
    this.buildUrl = typeof options.buildUrl === "function" ? options.buildUrl : buildSearchUrl;
    this.pageDelayMs = typeof options.pageDelayMs === "number" ? options.pageDelayMs : PAGE_DELAY_MS;
  }

  // 반환: { status: 'ok'|'empty'|'blocked'|'error', items, pagesFetched, errorMessage }
  //  - ok: 광고를 1개 이상 찾음. 중간 페이지에서 차단/오류로 멈췄다면 그때까지 모은 광고 +
  //    errorMessage에 "몇 페이지에서 멈췄는지" 안내(부분 결과)
  //  - empty: 페이지는 열렸지만 광고를 하나도 못 찾음(광고가 없는 키워드이거나 화면 구조가 다른 경우)
  //
  // 2026-10-01 순위/중복 보정 — 실사용 화면에서 같은 광고주(호텔스컴바인)가 문안만 다르게 두 번
  // 잡히고 순위가 어긋나는 문제가 확인돼서 바꿨어요:
  //  - 중복 판단을 "광고 ID"가 아니라 "사이트"(표시 URL 기준, siteMatch.js) 단위로 해요. 네이버는
  //    페이지를 새로 열 때마다 광고 순위를 다시 매기고 문안도 번갈아 보여주기 때문에, 페이지를 넘기는
  //    사이에 같은 광고주가 다른 문안(다른 광고 ID)으로 또 나올 수 있어요. 이럴 땐 처음 나온 자리를
  //    그 광고주의 순위로 보고, 다른 문안은 버리지 않고 otherCreatives에 모아둬요.
  //  - 페이지 넘김은 "새 광고주가 하나도 없는 페이지"에서 멈춰요(마지막 페이지 뒤에 같은 광고가
  //    반복되는 경우까지 막기 위해).
  //  - 순위 번호: 네이버가 각 광고의 클릭 추적 코드에 넣어둔 순위 번호(naverRank)가 모든 광고에
  //    있고 앞에서부터 계속 커지면(= 전체 기준 순위로 확인되면) 그 번호를 그대로 써요. 하나라도
  //    없거나 페이지마다 1부터 다시 시작하면(= 페이지 안 순위) 화면에 나온 순서대로 매겨요.
  //    어느 기준을 썼는지는 rankSource("naver" | "sequence")로 같이 돌려줘요.
  //  - stopWhen(ad): 키워드 노출분석처럼 특정 광고를 찾으면 바로 멈추고 싶을 때 쓰는 옵션
  //  - (2026-10-01) 모바일은 페이지 번호가 아니라 목록 아래 "더보기" 버튼을 누르면 광고가 이어서 붙는
  //    구조(대장님 확인)라서, 모바일은 &pagingIndex 대신 그 버튼을 눌러가며 모아요(_collectMobile).
  async listAds({ keyword, device = "pc", stopWhen = null }) {
    if (!keyword || !keyword.trim()) {
      return { status: "error", items: [], pagesFetched: 0, errorMessage: "keyword는 필수예요." };
    }
    const dev = device === "mobile" ? "mobile" : "pc";

    let browser = null;
    try {
      browser = await chromium.launch({ headless: this.headless });
      const context = await browser.newContext(
        dev === "mobile"
          ? { userAgent: USER_AGENT_MOBILE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ko-KR" }
          : { userAgent: USER_AGENT_DESKTOP, viewport: { width: 1366, height: 900 }, locale: "ko-KR" }
      );
      const page = await context.newPage();
      page.setDefaultTimeout(NAV_TIMEOUT_MS);

      // 여러 번에 나눠 들어오는 광고(PC 페이지 / 모바일 더보기)를 하나의 목록으로 합치는 공통 처리
      const state = { byKey: new Map(), items: [], mergedDuplicates: 0, found: false };
      const ingest = (raw, round, roundLabel) => {
        let added = 0;
        for (const it of raw) {
          const key = adSiteKey(it) || `row:${round}:${it.domIndex}`;
          const existing = state.byKey.get(key);
          if (existing) {
            // 같은 사이트의 광고가 또 나옴 — 순위는 처음 나온 자리 그대로, 다른 문안만 따로 보관
            const known = existing.adId === it.adId || existing.otherCreatives.some((o) => o.adId === it.adId);
            if (!known) {
              // 같은 광고를 다시 본 건(페이지를 다시 확인할 때 흔함) 세지 않고, 다른 문안일 때만 셉니다
              state.mergedDuplicates++;
              existing.otherCreatives.push({
                adId: it.adId,
                page: round,
                pageLabel: roundLabel,
                headline: it.headline,
                subtitles: it.subtitles,
                description: it.description,
              });
            }
            continue;
          }
          const item = { seq: state.items.length + 1, page: round, pageLabel: roundLabel, siteKey: key, ...it, otherCreatives: [] };
          state.byKey.set(key, item);
          state.items.push(item);
          added++;
          if (stopWhen && stopWhen(item)) {
            item.matched = true; // 찾은 광고 표시(최종 목록은 순위로 정렬되니 위치로 찾으면 안 돼요)
            state.found = true;
            break;
          }
        }
        return added;
      };

      const collected =
        dev === "mobile" ? await this._collectMobile(page, keyword.trim(), ingest, state) : await this._collectPc(page, keyword.trim(), ingest, state);
      if (collected.status !== "ok") {
        return { status: collected.status, items: [], pagesFetched: collected.pagesFetched || 0, errorMessage: collected.errorMessage };
      }

      // 순위 번호 결정 (위 주석 참고)
      const items = state.items;
      // 네이버 순위 번호(PC r= / 모바일 nclk — 둘 다 전체 기준임을 실제 샘플로 확인)가 모든 광고에
      // 있으면 그 번호로 정렬·표시해요. 모바일은 더보기 + 페이지 이동을 섞어서 모으기 때문에, 모은
      // 순서가 아니라 네이버 번호 순으로 정렬해야 실제 노출 순서와 맞아요. 하나라도 번호가 없으면
      // 모은 순서대로 매겨요.
      const allHaveNaverRank = items.length > 0 && items.every((it) => Number.isInteger(it.naverRank) && it.naverRank > 0);
      const rankSource = allHaveNaverRank ? "naver" : "sequence";
      if (allHaveNaverRank) items.sort((a, b) => a.naverRank - b.naverRank || a.seq - b.seq);
      for (const it of items) it.rank = allHaveNaverRank ? it.naverRank : it.seq;

      return {
        status: "ok",
        items,
        pagesFetched: collected.pagesFetched,
        rankSource,
        mergedDuplicates: state.mergedDuplicates,
        found: state.found,
        moreButton: collected.moreButton || null,
        loadSummary: collected.loadSummary || null,
        errorMessage: collected.stopNote || null,
      };
    } catch (err) {
      return { status: "error", items: [], pagesFetched: 0, errorMessage: err && err.message ? err.message : String(err) };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  // PC: 광고 더보기 페이지를 &pagingIndex=2, 3 ... 으로 넘기며 모읍니다.
  async _collectPc(page, keyword, ingest, state) {
    let pagesFetched = 0;
    let stopNote = null;
    for (let pageIndex = 1; pageIndex <= MAX_PAGES; pageIndex++) {
      if (pageIndex > 1) await sleep(this.pageDelayMs);
      let pageResult;
      try {
        pageResult = await this._loadPage(page, keyword, "pc", pageIndex);
      } catch (err) {
        pageResult = { status: "error", errorMessage: err && err.message ? err.message : String(err) };
      }
      if (pageResult.status === "blocked" || pageResult.status === "error") {
        if (state.items.length === 0) return { status: pageResult.status, pagesFetched, errorMessage: pageResult.errorMessage };
        stopNote = `${pageIndex}페이지를 불러오다가 멈춰서, ${pageIndex - 1 === 1 ? "1페이지" : `1~${pageIndex - 1}페이지`}에서 찾은 광고까지만 보여드려요. (${pageResult.errorMessage})`;
        break;
      }
      if (pageResult.raw.length === 0) {
        if (pageIndex === 1) return { status: "empty", pagesFetched, errorMessage: pageResult.emptyMessage };
        break; // 더 이상 광고 없음 — 정상 종료
      }
      const added = ingest(pageResult.raw, pageIndex, `${pageIndex}페이지`);
      if (state.found) {
        pagesFetched = pageIndex;
        break;
      }
      // 새 광고주가 하나도 없으면(같은 광고가 반복되는 페이지) 마지막 페이지로 보고 멈춥니다.
      if (added === 0) break;
      pagesFetched = pageIndex;
      if (pageIndex === MAX_PAGES) stopNote = `안전을 위해 최대 ${MAX_PAGES}페이지까지만 확인했어요.`;
    }
    return { status: "ok", pagesFetched, stopNote };
  }

  // 모바일: ① 첫 화면을 연 뒤 목록 아래 "더보기" 버튼을 눌러 광고를 이어 붙여가며 모으고,
  //        ② 이어서 페이지 주소(&pagingIndex=2, 3 ...)로도 끝까지 확인해서 빠진 광고를 채웁니다.
  // (2026-10-01) 실사용에서 모바일이 "더보기 1번, 광고 15개"에서 멈추는 문제가 확인됐어요. 반면 예전
  // 버전(주소로 페이지 이동)에서는 모바일도 5~6페이지, 29위까지 광고가 나왔었어요. 그래서 버튼이
  // 제대로 안 눌리더라도 주소 이동으로 끝까지 모을 수 있게 ②를 항상 이어서 해요. 같은 광고주는
  // 사이트 기준으로 합쳐지니 ①②에서 겹쳐도 중복되지 않아요.
  async _collectMobile(page, keyword, ingest, state) {
    let first;
    try {
      first = await this._loadPage(page, keyword, "mobile", 1);
    } catch (err) {
      return { status: "error", pagesFetched: 0, errorMessage: err && err.message ? err.message : String(err) };
    }
    if (first.status === "blocked" || first.status === "error") return { status: first.status, pagesFetched: 0, errorMessage: first.errorMessage };
    if (first.raw.length === 0) return { status: "empty", pagesFetched: 0, errorMessage: first.emptyMessage };

    // ⚠️ 광고 개수가 아니라 "목록 항목(li) 개수"로 추적해요. 목록에 광고가 아닌 항목이 섞여 있으면
    // 두 숫자가 달라서, 더보기 후 새 광고가 붙었는지 잘못 판단할 수 있어요(실제 샘플 테스트에서 발견).
    const countNodes = () => page.$$eval(AD_ITEM_SELECTOR, (n) => n.length).catch(() => 0);
    let domCount = await countNodes();
    let stopNote = null;
    let moreButton = null;
    let moreLoads = 0; // 더보기로 실제 새 광고를 불러온 횟수
    ingest(first.raw, 1, "첫 화면");

    // ① 더보기 버튼
    for (let i = 0; i < MAX_PAGES - 1 && !state.found; i++) {
      const clicked = await this._clickMore(page, domCount);
      if (clicked.info) moreButton = clicked.info;
      if (!clicked.ok) break;

      const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : "") || "").catch(() => "");
      if (BLOCK_INDICATORS.find((needle) => bodyText.includes(needle))) break; // 아래 ②에서 차단 여부를 다시 확인·기록해요

      const newCount = await countNodes();
      const all = await page.$$eval(AD_ITEM_SELECTOR, extractAdBatch).catch(() => []);
      // 보통은 기존 목록 뒤에 이어 붙지만(→ 새로 붙은 위치의 항목만), 혹시 목록이 통째로 바뀌는
      // 방식이면(항목 수가 줄어듦) 전체를 새로 받은 것으로 봐요.
      const fresh = newCount >= domCount ? all.filter((a) => a.domIndex >= domCount) : all;
      domCount = newCount;
      if (fresh.length === 0) break; // 눌렀는데 아무것도 안 붙음
      const added = ingest(fresh, moreLoads + 2, `더보기 ${moreLoads + 1}회`);
      if (added === 0 && !state.found) break; // 같은 광고만 반복
      moreLoads++;
      await sleep(this.pageDelayMs);
    }

    // ② 페이지 주소로 이어서 확인 — 이미 본 광고주는 합쳐지므로, 2페이지부터 다시 훑어도 안전해요.
    //    새 광고주가 없는 페이지가 2번 연속이거나, 광고가 하나도 없는 페이지가 나오면 멈춰요.
    let urlPagesWithNew = 0;
    let noProgress = 0;
    for (let pageIndex = 2; pageIndex <= MAX_PAGES && !state.found; pageIndex++) {
      await sleep(this.pageDelayMs);
      let pageResult;
      try {
        pageResult = await this._loadPage(page, keyword, "mobile", pageIndex);
      } catch (err) {
        pageResult = { status: "error", errorMessage: err && err.message ? err.message : String(err) };
      }
      if (pageResult.status === "blocked" || pageResult.status === "error") {
        stopNote = `모바일 ${pageIndex}페이지를 확인하다가 멈춰서, 그 전까지 찾은 광고만 보여드려요. (${pageResult.errorMessage})`;
        break;
      }
      if (pageResult.raw.length === 0) break;
      const added = ingest(pageResult.raw, pageIndex, `${pageIndex}페이지`);
      if (added > 0) {
        urlPagesWithNew++;
        noProgress = 0;
      } else if (++noProgress >= 2) {
        break;
      }
    }

    const parts = [`첫 화면`];
    if (moreLoads > 0) parts.push(`더보기 ${moreLoads}번`);
    parts.push(urlPagesWithNew > 0 ? `페이지 이동으로 새 광고 ${urlPagesWithNew}페이지 추가` : "페이지 이동으로 확인(추가 광고 없음)");
    return {
      status: "ok",
      pagesFetched: 1 + moreLoads + urlPagesWithNew,
      stopNote,
      moreButton,
      loadSummary: parts.join(" → "),
    };
  }

  // 목록 아래의 "더보기" 버튼을 찾아 누릅니다.
  // ⚠️ 안전장치: 광고 항목 안에 있는 요소나 광고 추적 링크(ader.naver.com)는 절대 누르지 않아요
  // (누르면 광고주에게 클릭 비용이 나갈 수 있어서). 광고 목록보다 아래에 있고 화면에 보이는,
  // 글자에 "더보기"가 들어간 버튼/링크만 대상으로 해요. 실제로 누른 요소 정보(태그/클래스/글자)는
  // info로 돌려줘서 실행 로그에 남겨요.
  async _clickMore(page, prevCount) {
    try {
      // 버튼이 화면 아래쪽에 늦게 그려지는 경우가 있어서 먼저 끝까지 내려봐요.
      await page.evaluate(() => window.scrollTo(0, document.body ? document.body.scrollHeight : 0)).catch(() => {});
      await page.waitForTimeout(300);
      const handle = await page.evaluateHandle((sel) => {
        const ads = Array.from(document.querySelectorAll(sel));
        const lastAd = ads[ads.length - 1];
        const cands = Array.from(document.querySelectorAll("a, button, [role='button']")).filter((el) => {
          const text = (el.textContent || "").replace(/\s+/g, "");
          if (text.indexOf("더보기") === -1 || text.length > 12) return false;
          if (el.closest(sel)) return false; // 광고 안의 요소는 절대 X
          if (el.closest("footer, #footer, [class*='footer']")) return false; // 페이지 맨 아래 공용 메뉴 제외
          if (/ader\.naver\.com/.test(el.getAttribute("href") || "")) return false; // 광고 추적 링크 절대 X
          if (lastAd && !(lastAd.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        // 글자가 정확히 "더보기"인 것 우선, 그다음은 광고 목록 바로 아래(문서 순서상 가장 먼저 나오는) 것
        const exact = cands.find((el) => (el.textContent || "").replace(/[\s+＋]/g, "") === "더보기");
        return exact || cands[0] || null;
      }, AD_ITEM_SELECTOR);
      const el = handle.asElement();
      if (!el) return { ok: false, info: null };
      const info = await el.evaluate(
        (e) => `${e.tagName.toLowerCase()}${e.className ? "." + String(e.className).trim().split(/\s+/).join(".") : ""} "${(e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 20)}"`
      );
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click();
      // 목록이 늘어나거나(이어 붙는 방식) 페이지가 바뀔 때까지(이동 방식) 기다립니다.
      await Promise.race([
        page
          .waitForFunction(([s, n]) => document.querySelectorAll(s).length !== n, [AD_ITEM_SELECTOR, prevCount], { timeout: RESULT_WAIT_MS })
          .catch(() => null),
        page.waitForNavigation({ timeout: RESULT_WAIT_MS }).catch(() => null),
      ]);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(400); // 새로 붙은 광고가 다 그려질 짧은 여유(차단 우회 목적 아님)
      return { ok: true, info };
    } catch (err) {
      return { ok: false, info: `더보기 클릭 실패: ${err && err.message ? err.message : String(err)}` };
    }
  }

  // 한 페이지를 열어 차단 여부를 확인하고 광고를 추출합니다.
  async _loadPage(page, keyword, device, pageIndex) {
    await page.goto(this.buildUrl(keyword, device, pageIndex), { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    // 광고 목록이 그려질 때까지 잠깐 기다립니다(없으면 그냥 다음 단계로 — 차단 우회 목적이 아닙니다).
    await page.waitForSelector(AD_ITEM_SELECTOR, { timeout: RESULT_WAIT_MS }).catch(() => {});

    const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : "") || "").catch(() => "");
    const matched = BLOCK_INDICATORS.find((needle) => bodyText.includes(needle));
    if (matched) {
      const debugInfo = await this._collectDebugInfo(page, bodyText, matched);
      return {
        status: "blocked",
        errorMessage: `네이버가 자동화된 접근으로 판단해 결과를 제한했어요. (우회하지 않고 이번 조회는 실패로 기록합니다.) [진단정보] ${debugInfo}`,
      };
    }

    const raw = await page.$$eval(AD_ITEM_SELECTOR, extractAdBatch).catch(() => []);
    if (raw.length === 0 && pageIndex === 1) {
      const debugInfo = await this._collectDebugInfo(page, bodyText, null);
      return {
        status: "ok",
        raw,
        emptyMessage: `이 키워드로 노출된 파워링크 광고를 찾지 못했어요. 광고가 없는 키워드이거나, 네이버 화면 구조가 다를 수 있어요. [진단정보] ${debugInfo}`,
      };
    }
    return { status: "ok", raw };
  }

  // 차단/빈 결과일 때 그 순간 실제로 어떤 화면을 보고 있었는지 남깁니다(개인정보 없음 —
  // 최종 URL, 제목, 감지된 문구, 본문 앞부분, 그리고 광고 링크가 화면에 몇 개 있었고 어떤
  // 요소 안에 들어있었는지 — 화면 구조가 다를 때 원인을 추측 없이 좁히기 위한 정보예요).
  async _collectDebugInfo(page, bodyText, matchedIndicator) {
    try {
      const finalUrl = page.url();
      const title = await page.title().catch(() => "");
      const bodySnippet = (bodyText || "").replace(/\s+/g, " ").trim().slice(0, 200);
      const adLinkInfo = await page
        .evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href*="ader.naver.com"]'));
          const containers = {};
          links.forEach((a) => {
            const li = a.closest("li");
            const key = li ? `li.${(li.className || "").toString().trim().split(/\s+/).slice(0, 3).join(".")}` : "(li 없음)";
            containers[key] = (containers[key] || 0) + 1;
          });
          return { adLinkCount: links.length, adLinkContainers: Object.entries(containers).slice(0, 5) };
        })
        .catch(() => null);
      return JSON.stringify({ finalUrl, title, matchedIndicator, bodySnippet, ...(adLinkInfo || {}) });
    } catch (e) {
      return `(진단 정보 수집 실패: ${e && e.message ? e.message : String(e)})`;
    }
  }
}

module.exports = { PlaywrightSearchAdProvider, extractAdBatch, AD_ITEM_SELECTOR, buildSearchUrl };
