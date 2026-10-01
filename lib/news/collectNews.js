// 고객사 뉴스 클리핑 — 네이버 뉴스 검색 API(공식 API)로 기업별 최근 기사를 모읍니다.
//
// 크롤링이 아니라 이미 쓰고 있는 네이버 검색 API(NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)를 써서
// 차단 걱정이 없어요. 검색어 1개당 API를 1번(최신순 100건) 호출해요.
//
// 흐름
//  1) 기업별 키워드마다 최신순 100건 조회
//  2) 최근 N일(기본 14일) 기사만 남기기
//  3) 제목/요약에 키워드가 진짜 들어있는 기사만 남기기(+ 문맥 단어 / 제외 단어 규칙)
//  4) 같은 기사(같은 원문 주소 또는 같은 제목) 합치기
//  5) "즉시 확인 / 관찰 항목" 분류(riskRules.js), 24시간 안의 기사는 "새 기사"
//  6) 100건이 전부 기간 안이면 → 그보다 오래된 기사는 확인 못 한 것이라 "일부 수집"으로 표시

const { classifyRisk } = require("./riskRules");
const { pressNameOf, hostOf } = require("./press");

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_ARTICLES_PER_CLIENT = 150;

const squash = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();

function cleanText(str) {
  if (!str) return "";
  return String(str)
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNewsDate(pubDate) {
  if (!pubDate) return null;
  const dt = new Date(pubDate);
  return isNaN(dt.getTime()) ? null : dt;
}

// 키워드를 품은 다른 단어(ignoreTerms)를 지운 뒤에 키워드가 남아있는지 봐요.
function containsKeyword(text, keywords, ignoreTerms) {
  let t = squash(text);
  for (const ig of ignoreTerms || []) {
    const s = squash(ig);
    if (s) t = t.split(s).join(" ");
  }
  return keywords.some((k) => {
    const s = squash(k);
    return !!s && t.includes(s);
  });
}

function containsAny(text, words) {
  const t = squash(text);
  return (words || []).some((w) => {
    const s = squash(w);
    return !!s && t.includes(s);
  });
}

// 이 기사가 이 기업 기사인지
function matchesClient(client, title, description) {
  const both = `${title} ${description}`;
  const scopeText = client.matchScope === "title" ? title : both;
  if (!containsKeyword(scopeText, client.keywords, client.ignoreTerms)) return false;
  if (client.excludeKeywords && client.excludeKeywords.length && containsAny(both, client.excludeKeywords)) return false;
  if (client.requireAny && client.requireAny.length && !containsAny(both, client.requireAny)) return false;
  return true;
}

function normalizeLink(u) {
  return String(u || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^(www|m)\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function titleKey(title) {
  return squash(title).replace(/[^0-9a-z가-힣]/g, "");
}

// 한 기업의 기사를 모아요.
//  fetcher(keyword) → 네이버 뉴스 API 응답(JSON). 테스트에서는 가짜 응답을 넣을 수 있게 밖에서 받아요.
async function collectClientNews(client, { fetcher, now = new Date(), windowDays = 14, newHours = 24 }) {
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const newSince = new Date(now.getTime() - newHours * 60 * 60 * 1000);
  const byLink = new Map();
  const byTitle = new Map();
  const notes = [];
  let partial = false;
  let errorCount = 0;
  let scannedCount = 0;

  for (const keyword of client.keywords) {
    let raw;
    try {
      raw = await fetcher(keyword);
    } catch (err) {
      errorCount += 1;
      partial = true;
      notes.push(`"${keyword}" 조회 실패: ${String((err && err.message) || err).slice(0, 120)}`);
      continue;
    }
    const items = (raw && Array.isArray(raw.items) ? raw.items : []);
    scannedCount += items.length;
    const total = Number(raw && raw.total) || items.length;

    // 최신순 100건이 꽉 찼는데 가장 오래된 기사도 기간 안이라면, 그보다 오래된 기간 내 기사는
    // 확인하지 못한 것 → "일부 수집"
    if (items.length >= PAGE_SIZE && total > items.length) {
      const oldest = parseNewsDate(items[items.length - 1].pubDate);
      if (oldest && oldest >= since) {
        partial = true;
        notes.push(`"${keyword}" 기사가 많아 최신 ${items.length}건까지만 확인했어요.`);
      }
    }

    for (const it of items) {
      const date = parseNewsDate(it.pubDate);
      if (!date || date < since || date > new Date(now.getTime() + 60 * 60 * 1000)) continue;
      const title = cleanText(it.title);
      const description = cleanText(it.description);
      if (!title) continue;
      if (!matchesClient(client, title, description)) continue;

      const originallink = it.originallink || it.link || "";
      const naverLink = it.link && /news\.naver\.com/.test(it.link) ? it.link : null;
      const linkKey = normalizeLink(originallink || it.link);
      const tKey = titleKey(title);
      if ((linkKey && byLink.has(linkKey)) || (tKey && byTitle.has(tKey))) continue;

      const risk = classifyRisk(title, description);
      const article = {
        id: linkKey || tKey,
        title,
        description: description.length > 180 ? `${description.slice(0, 180)}…` : description,
        link: originallink || it.link,
        naverLink,
        press: pressNameOf(originallink || it.link),
        domain: hostOf(originallink || it.link),
        publishedAt: date.toISOString(),
        isNew: date >= newSince,
        risk: risk.level,
        riskWords: risk.words,
        keyword,
      };
      if (linkKey) byLink.set(linkKey, article);
      if (tKey) byTitle.set(tKey, article);
    }
  }

  const unique = [...new Set([...byLink.values(), ...byTitle.values()])];
  unique.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  const articles = unique.slice(0, MAX_ARTICLES_PER_CLIENT);
  if (unique.length > MAX_ARTICLES_PER_CLIENT) {
    partial = true;
    notes.push(`기사가 너무 많아 최신 ${MAX_ARTICLES_PER_CLIENT}건만 보여드려요.`);
  }

  const status = errorCount && errorCount === client.keywords.length ? "error" : partial ? "partial" : "ok";
  return {
    id: client.id,
    name: client.name,
    domain: client.domain,
    keywords: client.keywords,
    status,
    notes,
    scannedCount,
    articleCount: articles.length,
    newCount: articles.filter((a) => a.isNew).length,
    criticalCount: articles.filter((a) => a.risk === "critical").length,
    watchCount: articles.filter((a) => a.risk === "watch").length,
    articles,
  };
}

// 여러 작업을 동시에 limit개씩 실행
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

// 전체 기업 수집. 같은 검색어를 여러 기업이 쓰면 API는 한 번만 불러요.
async function collectAllNews(clients, { fetchNews, now = new Date(), windowDays = 14, concurrency = 6 }) {
  const uniqKeywords = [...new Set(clients.flatMap((c) => c.keywords))];
  const cache = new Map();
  await mapLimit(uniqKeywords, concurrency, async (kw) => {
    try {
      cache.set(kw, { ok: true, data: await fetchNews(kw) });
    } catch (err) {
      cache.set(kw, { ok: false, error: err });
    }
  });
  const fetcher = async (kw) => {
    const hit = cache.get(kw);
    if (!hit) throw new Error("조회되지 않은 검색어");
    if (!hit.ok) throw hit.error;
    return hit.data;
  };
  const results = [];
  for (const c of clients) results.push(await collectClientNews(c, { fetcher, now, windowDays }));

  const summary = {
    clientCount: results.length,
    totalArticles: results.reduce((s, r) => s + r.articleCount, 0),
    newArticles: results.reduce((s, r) => s + r.newCount, 0),
    criticalArticles: results.reduce((s, r) => s + r.criticalCount, 0),
    watchArticles: results.reduce((s, r) => s + r.watchCount, 0),
    incompleteCount: results.filter((r) => r.status !== "ok").length,
    apiCalls: uniqKeywords.length,
  };
  return { clients: results, summary };
}

module.exports = { collectClientNews, collectAllNews, matchesClient, cleanText, parseNewsDate, mapLimit };
