// Playwright(헤드리스 브라우저)로 네이버 플레이스 검색 결과를 읽어서 순위를 측정합니다.
//
// 절대 원칙 (요청하신 조건 그대로):
//  - 캡차 자동 풀이, IP 우회(프록시 로테이션), 자동화 탐지 우회 로직을 넣지 않습니다.
//  - 네이버가 접근을 막으면(차단 페이지, 비정상 응답 등) 그대로 status: "blocked"로 보고하고 끝냅니다.
//    다른 방식으로 재시도하거나 우회를 시도하지 않습니다.
//  - 업체 식별은 이름 문자열이 아니라 URL에서 뽑은 고유 placeId로만 합니다.
//
// ⚠️ 중요: 아래 SEARCH_URL / 선택자들은 네이버 플레이스 검색 결과 페이지의 구조를 참고해
// 작성했지만, 이 코드를 작성하는 시점에 실제 라이브 페이지에 접속해서 확인할 방법이 없었습니다.
// 처음 실행했을 때 status가 계속 "error"(결과 목록을 찾지 못함)로 나온다면, 십중팔구
// 아래 RESULT_ITEM_SELECTOR / RESULT_LINK_SELECTOR가 실제 마크업과 달라서입니다.
// 브라우저 개발자도구로 실제 검색 결과 페이지의 DOM을 열어서 이 값들을 맞춰주세요.
// (네이버가 마크업을 바꿀 때마다 다시 손봐야 하는 것은 비공식 스크래핑의 구조적인 한계입니다.)

const { chromium } = require("playwright");
const { PlaceRankProvider } = require("./PlaceRankProvider");
const { extractPlaceIdFromUrl } = require("./extractPlaceId");
const { computeRank } = require("./rankExtraction");

const DEFAULT_MAX_RANK = 50;
const NAV_TIMEOUT_MS = 15000;
const MAX_SCROLL_ROUNDS = 12;

const SEARCH_URL = (keyword) => `https://m.place.naver.com/search?query=${encodeURIComponent(keyword)}`;
// 결과 리스트의 각 항목(li) — 실제 구조 확인 후 조정 필요.
const RESULT_ITEM_SELECTOR = "#_pcmap_list_scroll_container li, ul#_list > li, li[data-laim-exp-id]";
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

  async checkRank({ keyword, device = "mobile", targetPlaceId, maxRank = DEFAULT_MAX_RANK }) {
    if (!keyword || !keyword.trim()) {
      return { status: "error", rank: null, maxRankChecked: null, errorMessage: "keyword는 필수예요." };
    }
    if (!targetPlaceId) {
      return { status: "error", rank: null, maxRankChecked: null, errorMessage: "targetPlaceId는 필수예요." };
    }

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
      const topResults = items.map((it, idx) => ({
        placeId: it.placeId,
        name: it.name,
        rank: it.isAd ? null : idx + 1,
      }));

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
              const link = node.querySelector("a[href]");
              const href = link ? link.getAttribute("href") || link.href : "";
              const nameEl = node.querySelector("[class*='name'], span, strong");
              const name = (nameEl ? nameEl.textContent : node.textContent || "").trim().slice(0, 60);
              const isAd = (node.textContent || "").includes(adLabel);
              return { href, name, isAd };
            }),
          AD_LABEL_TEXT
        )
        .catch(() => []);

      let added = 0;
      for (const raw of batch) {
        const placeId = extractPlaceIdFromUrl(raw.href);
        if (!placeId || seen.has(placeId)) continue;
        seen.add(placeId);
        items.push({ placeId, name: raw.name, isAd: raw.isAd });
        added++;
        if (items.length >= maxRank) break;
      }

      stableRounds = added === 0 ? stableRounds + 1 : 0;
      if (items.length >= maxRank) break;

      await page.mouse.wheel(0, 1400);
      await page.waitForTimeout(700);
    }

    return items;
  }
}

module.exports = { PlaywrightPlaceRankProvider };
