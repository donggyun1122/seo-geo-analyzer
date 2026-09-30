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
// ⚠️ 아직 확인되지 않은 부분:
//  - 확인된 광고 샘플은 1건뿐이라, 광고 유형(배너형, 다른 업종 등)에 따라 마크업이 달라질
//    가능성은 남아있습니다. is_ad 플래그가 없는 다른 형태의 광고가 나온다면 텍스트("광고")
//    폴백으로 잡히는지 raw_top_results로 한 번 확인해보시는 게 좋아요.
//  - 데스크톱 레이아웃(지도+목록 분할 화면)에서 목록이 페이지 전체가 아니라 별도 스크롤
//    패널 안에 있을 수 있어서, 아래 _collectItems()는 li들을 감싸는 스크롤 가능한 조상
//    요소를 찾아 그 안에서 스크롤하도록 만들었습니다 — 다만 이것도 실제 여러 스크롤 후
//    동작까지 라이브로 검증하지는 못했습니다.

const { chromium } = require("playwright");
const { PlaceRankProvider } = require("./PlaceRankProvider");
const { computeRank } = require("./rankExtraction");

const DEFAULT_MAX_RANK = 50;
const NAV_TIMEOUT_MS = 15000;
const MAX_SCROLL_ROUNDS = 12;

const SEARCH_URL = (keyword) => `https://map.naver.com/p/search/${encodeURIComponent(keyword)}`;
// 결과 리스트의 각 항목(li). data-laim-exp-id 속성이 실제 라이브 페이지에서 확인됐어요.
// 나머지 두 개(#_pcmap_list_scroll_container, ul#_list)는 예전 m.place 레이아웃 기준으로
// 추측했던 값이라 지금은 안 맞을 가능성이 높지만, 매칭 안 되면 그냥 무시되니 안전하게 남겨둡니다.
const RESULT_ITEM_SELECTOR = "li[data-laim-exp-id], #_pcmap_list_scroll_container li, ul#_list > li";
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
    // 저장되지만, 아래 SEARCH_URL이 실제로 이 값을 네이버 검색 요청에 반영하지는 않아요.
    // 네이버 플레이스 검색이 위치를 좌표(예: &x=...&y=...)나 다른 공식 파라미터로 받는지
    // 확실히 검증된 바가 없어서, 근거 없는 파라미터를 추측해서 넣지 않았습니다. 즉 지금은
    // "검색 위치"를 다르게 입력해도 실제 검색 결과(따라서 순위)에는 차이가 없어요 — 검증된
    // 방식을 확인하기 전까지는 이 상태를 유지하는 게, 틀린 결과를 그럴듯하게 보여주는 것보다
    // 낫다고 판단했습니다.

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

      await page.goto(SEARCH_URL(keyword), { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

      const bodyText = await page.evaluate(() => document.body.innerText || "").catch(() => "");
      const blocked = BLOCK_INDICATORS.some((needle) => bodyText.includes(needle));
      if (blocked) {
        return {
          status: "blocked",
          rank: null,
          maxRankChecked: null,
          errorMessage: "네이버가 자동화된 접근으로 판단해 결과를 제한했어요. (우회하지 않고 이번 측정은 실패로 기록합니다.)",
        };
      }

      const hasResults = await page
        .locator(RESULT_ITEM_SELECTOR)
        .first()
        .isVisible({ timeout: NAV_TIMEOUT_MS })
        .catch(() => false);
      if (!hasResults) {
        return {
          status: "error",
          rank: null,
          maxRankChecked: null,
          errorMessage:
            "검색 결과 목록을 화면에서 찾지 못했어요. 네이버 페이지 구조가 바뀌었을 수 있어요 — RESULT_ITEM_SELECTOR를 실제 페이지 기준으로 다시 확인해주세요.",
        };
      }

      const items = await this._collectItems(page, maxRank);
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
    } catch (err) {
      return {
        status: "error",
        rank: null,
        maxRankChecked: null,
        errorMessage: err && err.message ? err.message : String(err),
      };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  // 무한 스크롤 목록에서 최대 maxRank개까지 아이템을 모읍니다.
  // 스크롤 사이의 짧은 대기는 "로딩을 기다리는 것"이지 차단 우회를 위한 것이 아닙니다.
  async _collectItems(page, maxRank) {
    const items = [];
    const seen = new Set();
    let stableRounds = 0;
    let round = 0;

    while (items.length < maxRank && stableRounds < 3 && round < MAX_SCROLL_ROUNDS) {
      round++;
      const batch = await page
        .$$eval(
          RESULT_ITEM_SELECTOR,
          (nodes, adLabel) =>
            nodes.map((node) => {
              // placeId와 광고 여부는 href가 아니라 data-nlog-params 속성들의 JSON에서
              // 뽑습니다. (검색 결과 항목의 <a>는 href="#"뿐이라 URL로는 식별자를 알 수
              // 없어요 — 2026-09-30에 사용자가 제공한 실제 라이브 마크업(organic 1건,
              // 광고 1건)으로 확인했습니다.)
              // 한 li 안에 data-nlog-params를 가진 요소가 여러 개 있을 수 있고(이름 링크,
              // 이미지 링크, 저장 버튼 등), 그 중 일부만 is_ad 필드를 갖고 있는 경우가
              // 있었습니다 — 그래서 하나만 보지 않고 전부 확인합니다.
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
              // is_ad 플래그를 우선 신뢰하고, 없으면 텍스트에 "광고"가 포함되는지로 보조
              // 판단합니다(스크린리더용 숨김 텍스트 span도 textContent에는 포함됩니다).
              const isAd = isAdFromParams || (node.textContent || "").includes(adLabel);
              return { placeId, name, isAd };
            }),
          AD_LABEL_TEXT
        )
        .catch(() => []);

      let added = 0;
      for (const raw of batch) {
        const placeId = raw.placeId;
        if (!placeId || seen.has(placeId)) continue;
        seen.add(placeId);
        items.push({ placeId, name: raw.name, isAd: raw.isAd });
        added++;
        if (items.length >= maxRank) break;
      }

      stableRounds = added === 0 ? stableRounds + 1 : 0;
      if (items.length >= maxRank) break;

      // 목록이 페이지 전체 스크롤이 아니라 별도 스크롤 패널(데스크톱 지도+목록 분할 화면 등) 안에
      // 있을 수 있어서, 결과 li를 감싸는 스크롤 가능한 조상 요소를 찾아 그 안에서 스크롤합니다.
      // 그런 조상을 못 찾으면 기존처럼 window 전체를 스크롤합니다(모바일 레이아웃 등).
      // ⚠️ 확인 필요: 이 스크롤 경로가 실제로 여러 라운드 동작하는지까지는 라이브로 검증하지
      // 못했습니다.
      await page
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
        }, RESULT_ITEM_SELECTOR)
        .catch(() => {});
      await page.waitForTimeout(700);
    }

    return items;
  }
}

module.exports = { PlaywrightPlaceRankProvider };
