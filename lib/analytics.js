// 사이트 이벤트 추적 — 사용자가 한 행동을 GTM(dataLayer)으로 보내요.
//
// 원리
//  - 모든 이벤트는 같은 모양으로 나가요:  { event: "dg_event", event_name: "<이벤트 이름>", ...값들 }
//    → GTM에서는 "맞춤 이벤트 dg_event" 트리거 하나와 GA4 이벤트 태그 하나만 있으면 전부 받을 수 있어요.
//  - 분석 화면(pages/*)의 코드는 건드리지 않아요. 대신 여기서 두 가지를 지켜봐요.
//     ① 사이트가 서버에 보내는 요청(/api/...) → 분석 시작/완료, 등록/삭제 같은 "기능 사용"
//     ② 화면에서 일어나는 클릭·선택 → 메뉴 이동, 필터, CSV 다운로드, 기사 클릭 등
//  - 추적 코드에서 오류가 나도 사이트 동작에는 영향이 없도록 전부 try/catch로 감쌌어요.
//
// 개인정보: 입력한 사이트 주소는 도메인만(경로·검색어 제외) 보내요. 이름·이메일 같은 정보는 보내지 않아요.
//
// 이벤트·값 목록은 README의 "GTM 이벤트" 표를 보세요. 새 이벤트를 추가하면 그 표도 같이 고쳐주세요.

// 이벤트와 함께 보내는 값의 이름(전체 목록). GTM의 "데이터 영역 변수"와 이름이 같아야 해요.
// 매 이벤트마다 전부 비운 뒤 채워서, 앞 이벤트의 값이 다음 이벤트에 섞이지 않게 해요.
export const PARAM_KEYS = [
  "tool", // 어떤 기능인지 (seo_analysis, keyword_analysis …)
  "tool_category", // 기능이 속한 영역 (search, advertising, local, intelligence, report, home)
  "search_term", // 입력한 키워드
  "target_domain", // 입력한 사이트의 도메인
  "device", // pc / mobile
  "result_status", // 결과 상태 (ok, empty, blocked, error, timeout, not_found …)
  "result_count", // 결과 개수 (광고 수, 업체 수, 기사 수 …)
  "duration_sec", // 걸린 시간(초)
  "score", // 점수 (SEO·GEO 종합 점수)
  "rank", // 순위 (플레이스 순위)
  "rank_pc", // PC 광고 순위
  "rank_mobile", // 모바일 광고 순위
  "link_area", // 클릭한 위치 (gnb, footer, home_tools, news_card …)
  "link_text", // 클릭한 글자
  "link_path", // 이동한 주소
  "item_name", // 대상 이름 (고객사명, 광고주명 …)
  "filter_value", // 선택한 값 (필터, 정렬, 기간 …)
  "method", // 방식 (auto, manual, refresh, drag, menu, add, update, delete …)
];

const PATH_TOOL = {
  "/": ["home", "home"],
  "/seo": ["seo_analysis", "search"],
  "/geo": ["geo_aeo", "search"],
  "/keyword": ["keyword_analysis", "search"],
  "/search-ad-rank": ["search_ads", "advertising"],
  "/search-ad": ["creative_analysis", "advertising"],
  "/keyword-place-list": ["place_analysis", "local"],
  "/place": ["place_ranking", "local"],
  "/news-clipping": ["news_clipping", "intelligence"],
  "/dashboard": ["dashboard", "report"],
};

const TOOL_CATEGORY = Object.fromEntries(Object.values(PATH_TOOL));
TOOL_CATEGORY.brand_content = "search";

function currentTool() {
  const hit = PATH_TOOL[window.location.pathname.replace(/\/+$/, "") || "/"];
  return hit ? hit[0] : "other";
}

// 이벤트 1건 보내기. 다른 파일에서도 import { track } 해서 쓸 수 있어요.
export function track(eventName, params = {}) {
  if (typeof window === "undefined") return;
  try {
    const payload = { event: "dg_event", event_name: eventName };
    for (const k of PARAM_KEYS) payload[k] = undefined;
    const tool = params.tool || currentTool();
    payload.tool = tool;
    payload.tool_category = params.tool_category || TOOL_CATEGORY[tool] || "other";
    for (const [k, v] of Object.entries(params)) {
      if (!PARAM_KEYS.includes(k) || v === undefined || v === null || v === "") continue;
      payload[k] = typeof v === "string" ? v.slice(0, 100) : v;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  } catch (e) {
    // 추적 실패는 조용히 넘어가요.
  }
}

// ── 도우미 ─────────────────────────────────────────────────────────────
function domainOf(raw) {
  const s = String(raw || "").trim();
  if (!s) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch (e) {
    return undefined;
  }
}

const textOf = (el) => (el ? (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) : "");
// 링크·버튼의 "이름" — 카드처럼 설명까지 들어 있는 경우 제목 글자만 써요.
function labelOf(el) {
  const title = el.querySelector(".gnb-item-label, strong, h3");
  const text = textOf(title || el).replace(/\s*soon$/i, "");
  return text.length > 1 ? text : el.getAttribute("aria-label") || text || undefined;
}
const lengthOf = (v) => (Array.isArray(v) ? v.length : undefined);
const secondsSince = (t) => Math.round((Date.now() - t) / 1000);

// ── ① 서버 요청 지켜보기 ──────────────────────────────────────────────────
// 바로 결과가 오는 분석
const SYNC_TOOLS = {
  "/api/analyze": { tool: "seo_analysis", start: (b) => ({ target_domain: domainOf(b.url) }), done: (d) => ({ score: d.overallScore }) },
  "/api/geo-entity": { tool: "geo_aeo", start: (b) => ({ target_domain: domainOf(b.url) }), done: (d) => ({ score: d.overallScore }) },
  "/api/keyword-analysis": { tool: "keyword_analysis", start: (b) => ({ search_term: b.keyword }), done: () => ({}) },
  "/api/brand-content": { tool: "brand_content", start: (b) => ({ search_term: b.keyword }), done: (d) => ({ result_count: d.totalMentions }) },
};

// 요청을 보내고(start) 결과를 나중에 받는(status) 분석
const ASYNC_TOOLS = {
  "/api/search-ad": {
    tool: "creative_analysis",
    start: (b) => ({ search_term: b.keyword, device: b.device }),
    done: (r) => ({ result_count: lengthOf(r.results) }),
  },
  "/api/search-ad-rank": {
    tool: "search_ads",
    start: (b) => ({ search_term: b.keyword, target_domain: domainOf(b.siteUrl), item_name: b.advertiserName }),
    done: (r) => {
      const res = r.results || {};
      const rankOf = (d) => (d && d.status === "found" ? d.rank : undefined);
      return { rank_pc: rankOf(res.pc), rank_mobile: rankOf(res.mobile) };
    },
  },
  "/api/keyword-place-list": {
    tool: "place_analysis",
    start: (b) => ({ search_term: b.keyword, device: b.device, filter_value: b.maxRank ? `top${b.maxRank}` : undefined }),
    done: (r) => ({ result_count: lengthOf(r.results) }),
  },
};

const PENDING_TIMEOUT_MS = 10.5 * 60 * 1000; // 화면의 최대 대기 시간(8~10분)보다 조금 길게
const pending = new Map(); // requestId → { tool, startedAt, params, timer }

function addPending(requestId, tool, params) {
  if (!requestId) return;
  const job = { tool, params, startedAt: Date.now() };
  job.timer = setTimeout(() => {
    if (!pending.has(requestId)) return;
    pending.delete(requestId);
    track("analysis_complete", { tool, ...params, result_status: "timeout", duration_sec: secondsSince(job.startedAt) });
  }, PENDING_TIMEOUT_MS);
  pending.set(requestId, job);
}

function finishPending(requestId, extra) {
  const job = pending.get(requestId);
  if (!job) return;
  clearTimeout(job.timer);
  pending.delete(requestId);
  track("analysis_complete", { tool: job.tool, ...job.params, duration_sec: secondsSince(job.startedAt), ...extra });
}

function describeRequest(input, init) {
  const rawUrl = typeof input === "string" ? input : input && input.url;
  if (!rawUrl) return null;
  const url = new URL(rawUrl, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return null;
  const method = String((init && init.method) || (typeof input !== "string" && input.method) || "GET").toUpperCase();
  let body = {};
  if (init && typeof init.body === "string") {
    try {
      body = JSON.parse(init.body) || {};
    } catch (e) {
      body = {};
    }
  }
  return { path: url.pathname, query: url.searchParams, method, body, startedAt: Date.now() };
}

function onRequest(req) {
  const sync = SYNC_TOOLS[req.path];
  if (sync && req.method === "POST") {
    req.params = sync.start(req.body);
    track("analysis_start", { tool: sync.tool, ...req.params });
    return;
  }
  const base = req.path.replace(/\/start$/, "");
  if (req.path.endsWith("/start") && ASYNC_TOOLS[base] && req.method === "POST") {
    req.params = ASYNC_TOOLS[base].start(req.body);
    track("analysis_start", { tool: ASYNC_TOOLS[base].tool, ...req.params });
    return;
  }
  if (req.path === "/api/place/check-now" && req.method === "POST") {
    track("analysis_start", { tool: "place_ranking", method: "check_now" });
    return;
  }
  if (req.path === "/api/news/clips") {
    req.params = { method: req.query.get("fresh") === "1" ? "refresh" : "auto" };
    track("analysis_start", { tool: "news_clipping", ...req.params });
  }
}

function onResponse(req, data) {
  const ok = !!(data && data.ok);
  const duration_sec = secondsSince(req.startedAt);

  const sync = SYNC_TOOLS[req.path];
  if (sync && req.method === "POST") {
    track("analysis_complete", { tool: sync.tool, ...req.params, result_status: ok ? "ok" : "error", duration_sec, ...(ok ? sync.done(data) : {}) });
    return;
  }

  // 나중에 결과가 오는 분석 — 시작 요청의 응답
  const startBase = req.path.replace(/\/start$/, "");
  if (req.path.endsWith("/start") && ASYNC_TOOLS[startBase]) {
    const tool = ASYNC_TOOLS[startBase].tool;
    if (ok) addPending(data.requestId, tool, req.params);
    else track("analysis_complete", { tool, ...req.params, result_status: "error", duration_sec });
    return;
  }
  // 결과 확인 요청의 응답(완료됐을 때 한 번만)
  const statusBase = req.path.replace(/\/status$/, "");
  if (req.path.endsWith("/status") && ASYNC_TOOLS[statusBase]) {
    if (ok && data.done) {
      const r = data.result || {};
      finishPending(req.query.get("requestId"), { result_status: r.status || "ok", ...ASYNC_TOOLS[statusBase].done(r) });
    }
    return;
  }

  // 플레이스 순위
  if (req.path === "/api/place/check-now") {
    if (ok) addPending(data.requestId, "place_ranking", { method: "check_now" });
    else track("analysis_complete", { tool: "place_ranking", method: "check_now", result_status: "error", duration_sec });
    return;
  }
  if (req.path === "/api/place/check-status") {
    if (ok && data.done) {
      const r = data.result || {};
      finishPending(req.query.get("requestId"), { result_status: r.status || "ok", rank: typeof r.rank === "number" ? r.rank : undefined });
    }
    return;
  }
  if (req.path === "/api/place/places" && req.method !== "GET") {
    if (ok) track(req.method === "DELETE" ? "place_delete" : "place_register", { tool: "place_ranking" });
    return;
  }
  if (req.path === "/api/place/keywords" && req.method !== "GET") {
    if (!ok) return;
    if (req.method === "DELETE") track("place_keyword_delete", { tool: "place_ranking" });
    else track("place_keyword_register", { tool: "place_ranking", search_term: req.body.keyword, device: req.body.device });
    return;
  }
  if (req.path === "/api/place/history") {
    if (ok) track("place_history_view", { tool: "place_ranking", filter_value: `${req.query.get("days") || ""}d`, result_count: lengthOf(data.history) });
    return;
  }

  // 뉴스 클리핑
  if (req.path === "/api/news/clips") {
    const s = (data && data.summary) || {};
    track("analysis_complete", {
      tool: "news_clipping",
      ...req.params,
      result_status: ok ? "ok" : "error",
      duration_sec,
      result_count: s.totalArticles,
    });
    return;
  }
  if (req.path === "/api/news/clients" && req.method !== "GET") {
    if (!ok) return;
    const method = req.body.action === "seed" ? "seed" : { POST: "add", PUT: "update", DELETE: "delete" }[req.method];
    track("news_client_change", { tool: "news_clipping", method, item_name: req.body.name });
  }
}

function installFetchTracking() {
  if (window.__dgFetchTracked || typeof window.fetch !== "function") return;
  window.__dgFetchTracked = true;
  const originalFetch = window.fetch;
  window.fetch = function trackedFetch(input, init) {
    let req = null;
    try {
      req = describeRequest(input, init);
      if (req) onRequest(req);
    } catch (e) {
      req = null;
    }
    const promise = originalFetch.apply(this, arguments);
    if (req) {
      // 응답은 "복사본"으로만 읽어요 — 화면이 쓰는 원래 응답은 그대로예요.
      promise
        .then((res) => {
          try {
            res
              .clone()
              .json()
              .then((data) => {
                try {
                  onResponse(req, data);
                } catch (e) {
                  // 무시
                }
              })
              .catch(() => {});
          } catch (e) {
            // 무시
          }
        })
        .catch(() => {});
    }
    return promise;
  };
}

// ── ② 화면 클릭·선택 지켜보기 ─────────────────────────────────────────────
const AREAS = [
  [".gnb-panel", "gnb"],
  [".mnav-panel", "mobile_menu"],
  [".gnb", "header"],
  [".site-footer", "footer"],
  [".quick-grid", "home_tools"],
  [".core-list", "home_core"],
  [".today-grid", "home_today"],
  [".cta", "home_cta"],
  [".news-modal", "modal"],
  [".news-priority", "news_priority"],
  [".news-card", "news_card"],
  [".dash", "dashboard"],
];

function areaOf(el) {
  for (const [sel, name] of AREAS) if (el.closest(sel)) return name;
  return "page";
}

function onClick(e) {
  const target = e.target;
  if (!target || !target.closest) return;

  const link = target.closest("a[href]");
  if (link) {
    if (link.matches(".news-article-link")) {
      const card = link.closest(".news-card");
      const client = card ? textOf(card.querySelector("h3")) : textOf(link.querySelector(".news-tag-client"));
      const item = link.closest(".news-article");
      const risk = item && item.classList.contains("news-article-critical") ? "critical" : item && item.classList.contains("news-article-watch") ? "watch" : "normal";
      track("news_article_click", { item_name: client, link_area: areaOf(link), filter_value: risk });
      return;
    }
    if (link.matches(".ad-card-url")) {
      const card = link.closest(".ad-card");
      track("ad_landing_click", { item_name: card ? textOf(card.querySelector(".ad-card-advertiser-name")) : undefined, link_area: "ad_card" });
      return;
    }
    if (link.hasAttribute("download") || /^(blob|data|javascript):/i.test(link.getAttribute("href"))) return; // 파일 저장용 임시 링크
    let url;
    try {
      url = new URL(link.getAttribute("href"), window.location.href);
    } catch (err) {
      return;
    }
    if (url.origin !== window.location.origin) return; // 외부 링크는 GA4 "향상된 측정"의 이탈 클릭이 잡아요.
    if (link.getAttribute("href").startsWith("#")) {
      track("button_click", { link_text: labelOf(link), link_area: areaOf(link), link_path: url.hash });
      return;
    }
    if (url.pathname === "/keyword" && url.searchParams.get("keyword") && link.target === "_blank") {
      track("related_keyword_click", { search_term: url.searchParams.get("keyword") });
      return;
    }
    track("nav_click", { link_area: areaOf(link), link_text: labelOf(link), link_path: url.pathname });
    return;
  }

  const btn = target.closest("button, summary, [role='button']");
  if (!btn) return;
  const text = textOf(btn);
  if (btn.matches(".gnb-trigger, .mnav-group-trigger")) return track("menu_open", { link_text: text, link_area: areaOf(btn) });
  if (btn.matches(".mnav-toggle")) return track("menu_open", { link_text: "mobile_menu", link_area: "header" });
  if (text.includes("CSV")) return track("csv_download", { link_text: text });
  if (btn.matches(".news-chip") || btn.closest(".ad-filter")) return track("filter_change", { filter_value: text.replace(/\s*\d+$/, ""), link_area: areaOf(btn) });
  if (btn.matches(".seg-btn")) return track("option_select", { link_text: "device", filter_value: text });
  if (btn.closest(".news-handle-menu")) {
    const card = btn.closest(".news-card");
    return track("card_reorder", { method: "menu", filter_value: text, item_name: card ? textOf(card.querySelector("h3")) : undefined });
  }
  if (btn.matches(".news-handle")) return undefined; // 순서 메뉴를 여는 버튼 — 실제 이동(card_reorder)만 기록해요.
  if (btn.closest(".news-card-foot")) {
    const card = btn.closest(".news-card");
    return track("news_view_all", { item_name: card ? textOf(card.querySelector("h3")) : undefined });
  }
  if (btn.getAttribute("type") === "submit") return undefined; // 분석 실행·등록은 서버 요청 쪽에서 기록해요.
  return track("button_click", { link_text: labelOf(btn), link_area: areaOf(btn) });
}

function onChange(e) {
  const el = e.target;
  if (!el || el.tagName !== "SELECT") return;
  const label = el.getAttribute("aria-label") || el.name || el.id || "select";
  const chosen = el.options && el.selectedIndex >= 0 ? textOf(el.options[el.selectedIndex]) : el.value;
  if (el.matches(".news-select")) track("sort_change", { filter_value: el.value });
  else track("option_select", { link_text: label, filter_value: chosen });
}

function onDrop(e) {
  const card = e.target && e.target.closest && e.target.closest(".news-card");
  if (card) track("card_reorder", { method: "drag", item_name: textOf(card.querySelector("h3")) });
}

// _app.js에서 한 번만 불러요.
export function initAnalytics() {
  if (typeof window === "undefined" || window.__dgAnalyticsReady) return;
  window.__dgAnalyticsReady = true;
  try {
    installFetchTracking();
    const safe = (fn) => (e) => {
      try {
        fn(e);
      } catch (err) {
        // 무시
      }
    };
    document.addEventListener("click", safe(onClick), true);
    document.addEventListener("change", safe(onChange), true);
    document.addEventListener("drop", safe(onDrop), true);
  } catch (e) {
    // 추적 준비에 실패해도 사이트는 그대로 동작해요.
  }
}
