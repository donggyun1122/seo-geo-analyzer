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
// ✅ 2026-10-01 페이지 넘김: 대장님이 확인해주신 대로 주소 뒤에 &pagingIndex=2, 3 ... 을 붙여서
//    "전체 결과"를 모읍니다. 끝 페이지 판단은 추측하지 않고 결과로만 합니다 — 그 페이지에서
//    광고를 하나도 못 찾았거나, 새 광고(광고 ID 기준) 없이 이전 페이지와 같은 광고만 나오면
//    거기서 멈춥니다. 페이지 사이에는 짧은 간격(PAGE_DELAY_MS)을 둡니다(예의상 간격이지 우회가
//    아니에요). 혹시 중간 페이지에서 차단되면, 그때까지 모은 광고는 살려서 보여주고 "몇 페이지에서
//    멈췄는지"를 같이 기록합니다.
//  - GitHub Actions 서버에서 접속했을 때도 이 페이지가 차단 없이 열리는지는 실제 실행으로
//    확인해야 해요(대장님 브라우저에서는 차단되지 않는 것을 확인해주셨어요).

const { chromium } = require("playwright");

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
    // 모바일 .url_link → PC a.url 순서(모바일의 .url은 여러 요소를 감싼 div라 쓰면 안 됨)
    const displayUrl = clean(node.querySelector(".url_area .url_link")) || clean(node.querySelector(".url_area a.url"));

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
  async listAds({ keyword, device = "pc" }) {
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

      const seen = new Set();
      const items = [];
      let pagesFetched = 0;
      let stopNote = null;

      for (let pageIndex = 1; pageIndex <= MAX_PAGES; pageIndex++) {
        if (pageIndex > 1) await sleep(this.pageDelayMs);

        let pageResult;
        try {
          pageResult = await this._loadPage(page, keyword.trim(), dev, pageIndex);
        } catch (err) {
          pageResult = { status: "error", errorMessage: err && err.message ? err.message : String(err) };
        }

        if (pageResult.status === "blocked" || pageResult.status === "error") {
          if (items.length === 0) {
            return { status: pageResult.status, items: [], pagesFetched, errorMessage: pageResult.errorMessage };
          }
          stopNote = `${pageIndex}페이지를 불러오다가 멈춰서, ${pageIndex - 1 === 1 ? "1페이지" : `1~${pageIndex - 1}페이지`}에서 찾은 광고까지만 보여드려요. (${pageResult.errorMessage})`;
          break;
        }

        if (pageResult.raw.length === 0) {
          if (pageIndex === 1) {
            return { status: "empty", items: [], pagesFetched, errorMessage: pageResult.emptyMessage };
          }
          break; // 더 이상 광고 없음 — 정상 종료
        }

        let added = 0;
        for (const it of pageResult.raw) {
          const key = it.adId || `${it.advertiser}|${it.headline}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push({ rank: items.length + 1, page: pageIndex, ...it });
          added++;
        }
        // 새 광고가 하나도 없으면(같은 페이지가 반복되는 경우) 마지막 페이지로 보고 멈춥니다.
        if (added === 0) break;
        pagesFetched = pageIndex; // 새 광고가 실제로 나온 마지막 페이지
        if (pageIndex === MAX_PAGES) {
          stopNote = `안전을 위해 최대 ${MAX_PAGES}페이지까지만 확인했어요.`;
        }
      }

      return { status: "ok", items, pagesFetched, errorMessage: stopNote };
    } catch (err) {
      return { status: "error", items: [], pagesFetched: 0, errorMessage: err && err.message ? err.message : String(err) };
    } finally {
      if (browser) await browser.close().catch(() => {});
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
        emptyMessage: `이 키워드로 노출된 파워링크 광고를 찾지 못했어요. 광고가 없는 키워드이거나, 네이버 화면 구조가 다를 수 있어요${
          device === "mobile" ? "(모바일은 아직 실제 광고 HTML로 검증하지 못했어요)" : ""
        }. [진단정보] ${debugInfo}`,
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
