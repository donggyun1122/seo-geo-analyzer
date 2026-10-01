// Playwright(헤드리스 브라우저)로 네이버쇼핑(search.shopping.naver.com) 검색 결과를 읽어서
// "네이버 쇼핑 키워드 분석"(키워드로 노출되는 상품 목록 전체)과 "네이버 쇼핑 순위 체크"
// (키워드 + 특정 상품의 순위)를 지원합니다.
//
// 절대 원칙 (플레이스 기능과 동일):
//  - 캡차 자동 풀이, IP 우회, 자동화 탐지 우회 로직을 넣지 않습니다.
//  - 네이버가 접근을 막으면(차단 문구 감지) 그대로 status: "blocked"로 보고하고 끝냅니다.
//
// ✅ 2026-09-30 — 사용자가 직접 개발자도구로 복사해서 제공한 실제 마크업 3건(광고/카탈로그/
// 개별상품)을 기준으로 아래 추출 로직을 작성하고, Python(BeautifulSoup)으로 동일 로직을
// 오프라인 시뮬레이션해서 세 샘플 모두 정확히 추출되는 것까지 확인한 뒤 이 파일을 작성했습니다.
// 확인된 내용:
//  1. 광고 항목은 class가 "adProduct_item__<해시>", 그 외(카탈로그/개별상품)는
//     "product_item__<해시>"로 시작합니다 — 대소문자가 달라서(Product vs product)
//     두 selector가 서로 겹치지 않습니다.
//  2. 각 항목 안의 data-nlog-params 속성(JSON)에 실제 순위가 그대로 들어있습니다 —
//     광고는 slot_dtl_ad_expose_order, 그 외는 slot_dtl_organic_expose_order. 플레이스
//     기능처럼 DOM 위치를 세어서 순위를 계산할 필요가 없어서, 오히려 플레이스보다
//     신뢰도가 높습니다. is_ad 필드도 이 JSON에 명시적으로 들어있어서 광고 판별에
//     클래스명과 이중으로 사용합니다.
//  3. 상품 ID는 세 가지 체계로 나뉩니다 — catalog_nv_mid(카탈로그 대표 ID),
//     nv_mid(개별/광고 상품의 네이버쇼핑 통합 ID), chnl_prod_no(판매처 자체 상품번호,
//     예: 스마트스토어 URL의 숫자). 카탈로그형 상품은 chnl_prod_no가 검색결과 데이터에
//     없습니다(자세한 내용은 extractShoppingProductId.js 참고).
//  4. "브랜드" 칸에 넣을 만한 값이 세 샘플 어디에도 없어서(요청하신 대로) 판매처(몰) 이름으로
//     대체합니다 — 카탈로그형은 최저가 판매처(.product_mall_list__ 첫 번째 li), 그 외는
//     "_mall_title__ a._mall__" 링크 텍스트(또는 광고의 slot_dtl_chnl_prod_nm)를 씁니다.
//  5. 평점/리뷰수 마크업이 광고와 그 외(organic)가 서로 다릅니다 — organic은
//     "_grade__" 클래스(화면에 안 보이는 "별점" 라벨 포함), 광고는 "_rating__" 클래스
//     (라벨 없음). 리뷰수는 같은 <a> 조상 안의 <em> 텍스트입니다.
//  6. 찜(위시리스트) 수는 광고("_favorite__" 클래스)와 organic("_etc__" 클래스)의 클래스명이
//     서로 달라서, 클래스명이 아니라 "자기 자신의 직접 텍스트가 '찜'으로 시작하는 요소"를
//     찾는 방식으로 통일했습니다(내부의 개수 표시는 <em>이 아니라 <span>이었습니다).
//  7. 판매처수(예: "판매처 74")는 카탈로그형에만 있고, 텍스트에서 정규식으로 뽑습니다.
//  8. 광고 썸네일에 "구매 1천+" 같은 배지가 있었는데, 이 배지 클래스가 다른 용도의
//     프로모션 문구에도 쓰일 수 있어 보여서, 텍스트가 실제로 "구매"로 시작할 때만
//     purchaseText로 채웁니다(그 외에는 추측하지 않고 null).
//
// ⚠️ 아직 확인되지 않은 부분 (라이브 환경에서 실제로 검증 필요):
//  - 페이지네이션(&pagingIndex=N)으로 다음 페이지를 넘어갈 때도 slot_dtl_organic_expose_order/
//    slot_dtl_ad_expose_order 값이 전체 결과 기준으로 계속 이어지는지(예: 2페이지 첫 상품이
//    50이 아니라 51인지), 아니면 페이지마다 다시 1부터 시작하는지 확인하지 못했습니다.
//    이 코드는 "네이버가 데이터에 넣어준 순위 값을 그대로 보여주기"만 하고 저희가 직접
//    순번을 다시 매기지 않기 때문에, 만약 페이지마다 리셋되는 방식이라면 2페이지 이후의
//    "순위" 표시가 실제 전체 순위와 다르게 보일 수 있습니다. 이 부분은 실제로 여러 페이지에
//    걸친 키워드로 확인해보시고 알려주시면 좋겠어요.
//  - 한 페이지에 몇 개의 상품이 노출되는지 확인된 바가 없어서(⚠️), 최대 페이지 수 상한
//    (MAX_PAGES)을 넉넉하게만 잡아뒀습니다 — 상한에 걸리면 그 사실을 errorMessage/
//    maxRankChecked로 그대로 알려줍니다(조용히 누락시키지 않습니다).
//  - 모바일(msearch.shopping.naver.com)은 요청하신 대로 이번 버전에서는 구현하지
//    않았습니다(PC만 우선).

const { chromium } = require("playwright");

const DEFAULT_MAX_RANK = 50;
const NAV_TIMEOUT_MS = 15000;
const MAX_PAGES = 12; // ⚠️ 확인 필요: 페이지당 노출 개수를 몰라서 넉넉하게 잡은 상한입니다.
// 2026-09-30 추가 — 네이버가 실제로 보여준 차단 안내 문구에 "짧은 시간 내에 너무 많은 요청이
// 이루어진 IP"가 차단 기준 중 하나로 명시돼 있어서, 페이지를 넘길 때마다 최소한의 대기를
// 둡니다(우회가 아니라 예의 있는 접근 — 플레이스 기능의 DELAY_BETWEEN_CHECKS_MS와 같은 취지).
const PAGE_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SEARCH_BASE_URL = "https://search.shopping.naver.com/search/all";
const ITEM_SELECTOR = "[class*='adProduct_item__'], [class*='product_item__']";

const BLOCK_INDICATORS = [
  "자동화된 요청",
  "비정상적인 접근",
  "일시적으로 제한",
  "captcha",
  "로봇이 아닙니다",
  "이용에 불편을 드려",
];

function buildSearchUrl(keyword, pageIndex) {
  const params = new URLSearchParams({ query: keyword });
  if (pageIndex > 1) params.set("pagingIndex", String(pageIndex));
  return `${SEARCH_BASE_URL}?${params.toString()}`;
}

// $$eval을 통해 브라우저 안에서 그대로 실행되는 함수입니다. 직렬화(toString) 후 브라우저에서
// 재평가되기 때문에 바깥(Node) 쪽 변수를 참조하지 않고, 매개변수와 브라우저 DOM API만
// 사용합니다(플레이스 기능 파일에서 확인된 동일한 제약 — 파일 위쪽 참고).
function extractShoppingBatch(nodes) {
  return nodes.map((node) => {
    const cls = node.className || "";
    const isAdByClass = typeof cls === "string" && cls.indexOf("adProduct_item") !== -1;

    const paramsEl = node.querySelector("[data-nlog-params]");
    let params = {};
    if (paramsEl) {
      try {
        params = JSON.parse(paramsEl.getAttribute("data-nlog-params")) || {};
      } catch (e) {
        params = {};
      }
    }
    const isAd = typeof params.is_ad === "boolean" ? params.is_ad : isAdByClass;
    const contentsGrp = params.contents_grp || null;

    const name = params.slot_dtl_prod_nm || null;

    const priceRaw = params.slot_dtl_price || params.slot_dtl_lowest_price || null;
    const price = priceRaw ? parseInt(String(priceRaw).replace(/[^0-9]/g, ""), 10) : null;

    let rank = null;
    if (isAd) {
      rank = params.slot_dtl_ad_expose_order ? parseInt(params.slot_dtl_ad_expose_order, 10) : null;
    } else {
      rank = params.slot_dtl_organic_expose_order ? parseInt(params.slot_dtl_organic_expose_order, 10) : null;
    }

    let catalogNvMid = params.slot_dtl_catalog_nv_mid || null;
    let nvMid = params.slot_dtl_nv_mid || null;
    const chnlProdNo = params.slot_dtl_chnl_prod_no || null;
    if (!catalogNvMid && params.content_id_origin === "catalog_nv_mid") catalogNvMid = params.content_id || null;
    if (!nvMid && params.content_id_origin === "nv_mid") nvMid = params.content_id || null;

    const catEls = node.querySelectorAll("[class*='_category__']");
    const catParts = [];
    catEls.forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t && catParts.indexOf(t) === -1) catParts.push(t);
    });
    let category = catParts.length ? catParts.join(" > ") : null;
    if (!category && params.slot_dtl_exhibition_category) category = params.slot_dtl_exhibition_category;

    // 판매처수(카탈로그형만 존재) — "판매처 74" 같은 텍스트에서 숫자만 추출
    let sellerCount = null;
    const fullText = node.textContent || "";
    const sellerMatch = fullText.match(/판매처\s*([\d,]+)/);
    if (sellerMatch) sellerCount = parseInt(sellerMatch[1].replace(/,/g, ""), 10);

    // "브랜드" 칸 대체값 — 판매처(몰) 이름. 카탈로그형은 최저가 판매처(목록 첫 항목),
    // 그 외(광고/개별상품)는 몰 링크 텍스트를 사용합니다.
    let mallName = null;
    if (contentsGrp === "catalog") {
      const firstLi = node.querySelector("[class*='_mall_list__'] li [class*='_mall_name__']");
      if (firstLi) {
        mallName = (firstLi.textContent || "").trim() || null;
      } else {
        const badge = node.querySelector("[class*='_mall_title__'] a");
        if (badge) {
          const badgeText = (badge.textContent || "").trim();
          if (badgeText && badgeText.indexOf("브랜드 카탈로그") === -1) mallName = badgeText;
        }
      }
    } else {
      const mallLink = node.querySelector("[class*='_mall_title__'] a[class*='_mall__']");
      if (mallLink) {
        mallName = (mallLink.textContent || "").trim() || null;
      } else if (params.slot_dtl_chnl_prod_nm) {
        mallName = params.slot_dtl_chnl_prod_nm;
      }
    }

    // 평점/리뷰수 — organic은 "_grade__"(별점 라벨 포함), 광고는 "_rating__"(라벨 없음)
    let rating = null;
    let reviewCount = null;
    const gradeEl = node.querySelector("[class*='_grade__']") || node.querySelector("[class*='_rating__']");
    if (gradeEl) {
      const t = (gradeEl.textContent || "").replace("별점", "").trim();
      rating = t || null;
      let anc = gradeEl;
      let linkEl = null;
      for (let i = 0; i < 4 && anc; i++) {
        if (anc.tagName === "A") {
          linkEl = anc;
          break;
        }
        anc = anc.parentElement;
      }
      if (linkEl) {
        const em = linkEl.querySelector("em");
        if (em) reviewCount = (em.textContent || "").replace(/[(),]/g, "").trim() || null;
      }
    }

    // 찜(위시리스트) 수 — 클래스명이 광고/organic마다 달라서, 대신 "자기 직접 텍스트가
    // '찜'으로 시작하는 요소"를 찾아 그 안의 숫자 요소(em 또는 span)를 읽습니다.
    let zzimCount = null;
    const allEls = node.querySelectorAll("*");
    for (let i = 0; i < allEls.length; i++) {
      const el = allEls[i];
      let directText = "";
      for (let c = 0; c < el.childNodes.length; c++) {
        const cn = el.childNodes[c];
        if (cn.nodeType === 3) directText += cn.textContent;
      }
      directText = directText.trim();
      if (directText.indexOf("찜") === 0) {
        const countEl = el.querySelector("em, span");
        if (countEl) zzimCount = (countEl.textContent || "").replace(/,/g, "").trim() || null;
        break;
      }
    }

    // 구매 배지(광고 썸네일의 "구매 1천+" 등) — 다른 프로모션 문구일 수도 있어서, 텍스트가
    // 실제로 "구매"로 시작할 때만 채웁니다.
    let purchaseText = null;
    const badgeEl = node.querySelector("[class*='_thumb_badge__']");
    if (badgeEl) {
      const bt = (badgeEl.textContent || "").trim();
      if (bt.indexOf("구매") === 0) purchaseText = bt;
    }

    const imgEl = node.querySelector("img");
    const image = imgEl ? imgEl.getAttribute("src") : null;

    const linkEl2 = node.querySelector("a[href]");
    const productUrl = linkEl2 ? linkEl2.getAttribute("href") : null;

    return {
      isAd,
      contentsGrp,
      rank,
      name,
      image,
      price,
      category,
      mallName,
      sellerCount,
      rating,
      reviewCount,
      zzimCount,
      purchaseText,
      productUrl,
      catalogNvMid: catalogNvMid ? String(catalogNvMid) : null,
      nvMid: nvMid ? String(nvMid) : null,
      chnlProdNo: chnlProdNo ? String(chnlProdNo) : null,
    };
  });
}

class PlaywrightShoppingRankProvider {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.userAgent =
      options.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  // "네이버 쇼핑 키워드 분석" — 키워드 하나로 노출되는 상품 전체를 최대 maxRank개까지 반환합니다.
  async listProducts({ keyword, maxRank = DEFAULT_MAX_RANK }) {
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

      const items = [];
      for (let pageIndex = 1; pageIndex <= MAX_PAGES; pageIndex++) {
        if (pageIndex > 1) await sleep(PAGE_DELAY_MS);
        const pageResult = await this._loadSearchPage(page, keyword, pageIndex);
        if (pageResult.status === "blocked") {
          return { status: "blocked", items: [], errorMessage: pageResult.errorMessage };
        }
        if (pageResult.status === "error") {
          // 이미 몇 개 모았다면 그 값이라도 보여주는 게 나아서, 완전히 실패로 처리하지 않고
          // 지금까지 모은 items로 마무리합니다(원인은 errorMessage에 남겨둡니다).
          if (items.length === 0) {
            return { status: "error", items: [], errorMessage: pageResult.errorMessage };
          }
          break;
        }
        if (pageResult.items.length === 0) break; // 더 이상 결과 없음 — 정상 종료
        items.push(...pageResult.items);
        if (items.length >= maxRank) break;
      }

      return { status: "ok", items: items.slice(0, maxRank), errorMessage: null };
    } catch (err) {
      return { status: "error", items: [], errorMessage: err && err.message ? err.message : String(err) };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  // "네이버 쇼핑 순위 체크" — 키워드 + 특정 상품(targetIdValue/targetIdSpace)이 광고 영역
  // 또는 광고 제외(organic) 영역 중 어디서 몇 순위인지 확인합니다. areaMode: 'ad' | 'organic'.
  async checkRank({ keyword, targetIdValue, targetIdSpace, areaMode = "organic", maxRank = 200 }) {
    if (!keyword || !keyword.trim()) {
      return { status: "error", rank: null, matchedItem: null, maxRankChecked: null, errorMessage: "keyword는 필수예요." };
    }
    if (!targetIdValue) {
      return {
        status: "error",
        rank: null,
        matchedItem: null,
        maxRankChecked: null,
        errorMessage: "상품 URL 또는 ID를 확인하지 못했어요.",
      };
    }

    function matches(item) {
      if (targetIdSpace === "catalog_nv_mid") return item.catalogNvMid === targetIdValue;
      if (targetIdSpace === "nv_mid") return item.nvMid === targetIdValue;
      if (targetIdSpace === "chnl_prod_no") return item.chnlProdNo === targetIdValue;
      // space를 모를 때는 세 필드 중 아무거나 일치하면 매칭
      return (
        item.catalogNvMid === targetIdValue || item.nvMid === targetIdValue || item.chnlProdNo === targetIdValue
      );
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

      let scannedInArea = 0;
      for (let pageIndex = 1; pageIndex <= MAX_PAGES; pageIndex++) {
        if (pageIndex > 1) await sleep(PAGE_DELAY_MS);
        const pageResult = await this._loadSearchPage(page, keyword, pageIndex);
        if (pageResult.status === "blocked") {
          return {
            status: "blocked",
            rank: null,
            matchedItem: null,
            maxRankChecked: scannedInArea,
            errorMessage: pageResult.errorMessage,
          };
        }
        if (pageResult.status === "error") {
          if (scannedInArea === 0) {
            return {
              status: "error",
              rank: null,
              matchedItem: null,
              maxRankChecked: null,
              errorMessage: pageResult.errorMessage,
            };
          }
          break;
        }
        if (pageResult.items.length === 0) break;

        const areaItems = pageResult.items.filter((it) => (areaMode === "ad" ? it.isAd : !it.isAd));
        for (const item of areaItems) {
          scannedInArea++;
          if (matches(item)) {
            return {
              status: "ok",
              rank: item.rank !== null ? item.rank : scannedInArea,
              matchedItem: item,
              maxRankChecked: scannedInArea,
              errorMessage: null,
            };
          }
          if (scannedInArea >= maxRank) break;
        }
        if (scannedInArea >= maxRank) break;
      }

      return {
        status: "not_found",
        rank: null,
        matchedItem: null,
        maxRankChecked: scannedInArea,
        errorMessage: `${areaMode === "ad" ? "광고 영역" : "광고 제외(일반) 영역"} 상위 ${scannedInArea}위 안에서 상품을 찾지 못했어요. 그보다 낮은 순위이거나, 카탈로그로 묶인 상품이라 이 ID로는 찾을 수 없는 경우일 수 있어요.`,
      };
    } catch (err) {
      return {
        status: "error",
        rank: null,
        matchedItem: null,
        maxRankChecked: null,
        errorMessage: err && err.message ? err.message : String(err),
      };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  // 한 페이지를 열어서 차단 여부를 확인하고 아이템을 추출합니다. listProducts/checkRank가 공유합니다.
  async _loadSearchPage(page, keyword, pageIndex) {
    try {
      const url = buildSearchUrl(keyword, pageIndex);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await page.waitForTimeout(500); // 목록이 그려질 짧은 대기(차단 우회 목적이 아닙니다)

      const bodyText = await page.evaluate(() => document.body.innerText || "").catch(() => "");
      const matchedIndicator = BLOCK_INDICATORS.find((needle) => bodyText.includes(needle));
      if (matchedIndicator) {
        // 어떤 문구 때문에 차단으로 판단했는지, 그 순간 실제로 어느 URL/화면을 보고 있었는지를
        // 그대로 남깁니다(개인정보 없음 — 최종 URL/제목/본문 앞부분만) — 플레이스 기능에서
        // "추측으로 계속 고치기보다 실제 데이터로 원인을 좁히자"고 정한 방식과 동일합니다.
        const debugInfo = await this._collectDebugInfo(page, matchedIndicator, bodyText);
        return {
          status: "blocked",
          items: [],
          errorMessage: `네이버가 자동화된 접근으로 판단해 결과를 제한했어요. (우회하지 않고 이번 조회는 실패로 기록합니다.) [진단정보] ${debugInfo}`,
        };
      }

      const items = await page.$$eval(ITEM_SELECTOR, extractShoppingBatch).catch((err) => {
        throw new Error(`상품 목록을 추출하는 중 오류: ${err && err.message ? err.message : String(err)}`);
      });
      return { status: "ok", items };
    } catch (err) {
      return { status: "error", items: [], errorMessage: err && err.message ? err.message : String(err) };
    }
  }

  // 차단 문구가 감지됐을 때, 그 순간 실제로 어느 URL/화면을 보고 있었는지 남깁니다
  // (개인정보나 비밀값은 다루지 않는 값들만 — 최종 URL, 제목, 감지된 문구, 본문 앞부분).
  async _collectDebugInfo(page, matchedIndicator, bodyText) {
    try {
      const finalUrl = page.url();
      const title = await page.title().catch(() => "");
      const bodySnippet = (bodyText || "").replace(/\s+/g, " ").trim().slice(0, 200);
      return JSON.stringify({ finalUrl, title, matchedIndicator, bodySnippet });
    } catch (e) {
      return `(진단 정보 수집 자체가 실패했습니다: ${e && e.message ? e.message : String(e)})`;
    }
  }
}

module.exports = { PlaywrightShoppingRankProvider };
