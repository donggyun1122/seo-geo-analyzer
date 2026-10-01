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
//  - 광고가 많아서 페이지가 넘어가는 경우(2페이지 이상)의 주소 형식을 모르기 때문에, 지금은
//    첫 페이지에 노출된 광고만 가져옵니다.
//  - PC 화면 기준입니다(모바일 광고 노출은 다를 수 있어요).
//  - GitHub Actions 서버에서 접속했을 때도 이 페이지가 차단 없이 열리는지는 실제 실행으로
//    확인해야 해요(대장님 브라우저에서는 차단되지 않는 것을 확인해주셨어요).

const { chromium } = require("playwright");

const NAV_TIMEOUT_MS = 20000;
const RESULT_WAIT_MS = 8000;

const SEARCH_URL = (keyword) =>
  `https://ad.search.naver.com/search.naver?where=ad&query=${encodeURIComponent(keyword)}`;

const AD_ITEM_SELECTOR = "li.lst";

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

    let adId = null;
    const clickEls = node.querySelectorAll("[onclick]");
    for (let i = 0; i < clickEls.length; i++) {
      const m = (clickEls[i].getAttribute("onclick") || "").match(/nad-[A-Za-z0-9-]+/);
      if (m) {
        adId = m[0];
        break;
      }
    }

    const advertiser = clean(node.querySelector(".url_area .site"));
    const displayUrl = clean(node.querySelector(".url_area .url"));

    // 실제 랜딩 주소 — 추적 URL(ader.naver.com)이 아니라 favicon 링크 onclick 안의 원래 도메인
    let landingUrl = null;
    const fav = node.querySelector(".url_area .favicon_wrap");
    if (fav) {
      const m = (fav.getAttribute("onclick") || "").match(/urlencode\("(https?:\/\/[^"]+)"\)/);
      if (m) landingUrl = m[1];
    }
    if (!landingUrl && displayUrl) {
      landingUrl = "https://" + displayUrl.replace(/^https?:\/\//, "").replace(/\s+/g, "");
    }

    const faviconEl = node.querySelector(".icon_favicon");
    const favicon = faviconEl ? faviconEl.getAttribute("src") : null;

    const titles = titWrap
      ? Array.from(titWrap.querySelectorAll(".lnk_tit")).map(clean).filter(Boolean)
      : [];
    const headline = titles[0] || clean(titWrap);
    const subtitles = titles.slice(1);

    const description = clean(node.querySelector(".desc_area .link_desc")) || clean(node.querySelector(".desc_area"));

    const imgEl = node.querySelector(".ad_thumb img");
    const imageUrl = imgEl ? imgEl.getAttribute("src") : null;

    const extEl = node.querySelector(".link_ext_desc");
    const extension = extEl
      ? { label: clean(extEl.querySelector(".prefix_ext")), text: clean(extEl.querySelector(".title_ext")) }
      : null;

    const sublinks = Array.from(node.querySelectorAll(".lst_link .link")).map(clean).filter(Boolean);
    const badges = Array.from(node.querySelectorAll(".ico_area .sp_nad")).map(clean).filter(Boolean);
    const adPeriod = clean(node.querySelector(".period_area .txt"));
    const promotion = node.getAttribute("data-promotion") || null;
    const adFormats = Array.from(node.classList).filter((c) => c.indexOf("type_") === 0 || c.indexOf("ext_") === 0);

    out.push({
      domIndex,
      dataIndex,
      adId,
      advertiser,
      displayUrl,
      landingUrl,
      favicon,
      headline,
      subtitles,
      description,
      imageUrl,
      extension: extension && (extension.label || extension.text) ? extension : null,
      sublinks,
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
    this.userAgent =
      options.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    // 테스트용 — 실제 실행에서는 쓰지 않고 항상 SEARCH_URL(네이버 광고 더보기 주소)을 씁니다.
    this.buildUrl = typeof options.buildUrl === "function" ? options.buildUrl : SEARCH_URL;
  }

  // 반환: { status: 'ok'|'empty'|'blocked'|'error', items, errorMessage }
  //  - empty: 페이지는 정상적으로 열렸지만 광고 항목을 하나도 찾지 못함(광고가 없는 키워드이거나,
  //    네이버 화면 구조가 바뀐 경우 — 구분할 수 있도록 진단정보를 같이 남깁니다)
  async listAds({ keyword }) {
    if (!keyword || !keyword.trim()) {
      return { status: "error", items: [], errorMessage: "keyword는 필수예요." };
    }

    let browser = null;
    try {
      browser = await chromium.launch({ headless: this.headless });
      const context = await browser.newContext({
        userAgent: this.userAgent,
        viewport: { width: 1366, height: 900 },
        locale: "ko-KR",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(NAV_TIMEOUT_MS);

      await page.goto(this.buildUrl(keyword.trim()), { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      // 광고 목록이 그려질 때까지 잠깐 기다립니다(없으면 그냥 다음 단계로 — 차단 우회 목적이 아닙니다).
      await page.waitForSelector(AD_ITEM_SELECTOR, { timeout: RESULT_WAIT_MS }).catch(() => {});

      const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : "") || "").catch(() => "");
      const matched = BLOCK_INDICATORS.find((needle) => bodyText.includes(needle));
      if (matched) {
        const debugInfo = await this._collectDebugInfo(page, bodyText, matched);
        return {
          status: "blocked",
          items: [],
          errorMessage: `네이버가 자동화된 접근으로 판단해 결과를 제한했어요. (우회하지 않고 이번 조회는 실패로 기록합니다.) [진단정보] ${debugInfo}`,
        };
      }

      const raw = await page.$$eval(AD_ITEM_SELECTOR, extractAdBatch);
      if (!raw.length) {
        const debugInfo = await this._collectDebugInfo(page, bodyText, null);
        return {
          status: "empty",
          items: [],
          errorMessage: `이 키워드로 노출된 파워링크 광고를 찾지 못했어요. 광고가 없는 키워드이거나, 네이버 화면 구조가 바뀌었을 수 있어요. [진단정보] ${debugInfo}`,
        };
      }

      // 같은 광고가 중복으로 잡히는 경우(광고 ID 기준)를 제거하고, 화면에 보인 순서대로 순위를 매깁니다.
      const seen = new Set();
      const items = [];
      for (const it of raw) {
        const key = it.adId || `${it.advertiser}|${it.headline}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ rank: items.length + 1, ...it });
      }
      return { status: "ok", items, errorMessage: null };
    } catch (err) {
      return { status: "error", items: [], errorMessage: err && err.message ? err.message : String(err) };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  // 차단/빈 결과일 때 그 순간 실제로 어떤 화면을 보고 있었는지 남깁니다(개인정보 없음 —
  // 최종 URL, 제목, 감지된 문구, 본문 앞부분만).
  async _collectDebugInfo(page, bodyText, matchedIndicator) {
    try {
      const finalUrl = page.url();
      const title = await page.title().catch(() => "");
      const bodySnippet = (bodyText || "").replace(/\s+/g, " ").trim().slice(0, 200);
      return JSON.stringify({ finalUrl, title, matchedIndicator, bodySnippet });
    } catch (e) {
      return `(진단 정보 수집 실패: ${e && e.message ? e.message : String(e)})`;
    }
  }
}

module.exports = { PlaywrightSearchAdProvider, extractAdBatch, AD_ITEM_SELECTOR, SEARCH_URL };
