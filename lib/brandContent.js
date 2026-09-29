// 브랜드 키워드로 네이버(블로그/뉴스/카페) 콘텐츠 발행 현황을 조회합니다.
// 필요한 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET

const NAVER_SEARCH_BASE = "https://naverapihub.apigw.ntruss.com/search/v1";
const NAVER_ENDPOINTS = {
  blog: `${NAVER_SEARCH_BASE}/blog`,
  news: `${NAVER_SEARCH_BASE}/news`,
  cafearticle: `${NAVER_SEARCH_BASE}/cafearticle`,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_START = 901; // 검색 결과 한 번에 최대 1,000건까지만 페이지를 넘길 수 있어요.

function cleanText(str) {
  if (!str) return "";
  return str
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .trim();
}

// 블로그 검색 postdate: "20230101" (YYYYMMDD, 문자열)
function parseBlogDate(postdate) {
  if (!postdate || String(postdate).length !== 8) return null;
  const s = String(postdate);
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  const dt = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

// 뉴스 검색 pubDate: "Mon, 24 Jun 2013 19:14:00 +0900" (RFC 2822)
function parseNewsDate(pubDate) {
  if (!pubDate) return null;
  const dt = new Date(pubDate);
  return isNaN(dt.getTime()) ? null : dt;
}

// 절대 시각을 한국 시간(KST) 기준 "YYYY-MM-DD" 캘린더 날짜로 변환합니다.
// (서버가 어느 시간대에서 돌아가든 항상 같은 결과가 나오도록 UTC 계산만으로 구해요.
//  toISOString()을 바로 slice하면 서버가 KST가 아닐 때 날짜가 하루 밀리는 문제가 있었어요.)
function kstDateParts(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
}

function kstDateKey(date) {
  const { year, month, day } = kstDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateLabel(date) {
  const { year, month, day } = kstDateParts(date);
  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
}

export async function fetchNaverSearch(type, keyword, clientId, clientSecret, opts = {}) {
  const endpoint = NAVER_ENDPOINTS[type];
  const display = opts.display || 100;
  const sort = opts.sort || "date";
  const start = opts.start || 1;
  const url = `${endpoint}?query=${encodeURIComponent(keyword)}&display=${display}&sort=${sort}&start=${start}`;
  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`${type} 검색 결과 조회 실패 (status ${res.status})${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

// 최신순으로 페이지를 넘겨가며 아이템을 모읍니다. 정렬이 "최신순"이라, 한 페이지의
// 마지막 아이템이 이미 sinceBoundary보다 오래됐으면 그 뒤로는 볼 필요가 없어서 멈춰요.
// (기존에는 딱 1페이지 100건만 봐서, 발행이 잦은 키워드는 최근 며칠치만 채워지고
//  그보다 이전 날짜는 실제로는 게시물이 많은데도 전부 0으로 나오는 문제가 있었어요.)
//
// 다만 네이버 검색 API는 한 번에 최대 1,000건까지만 페이지를 넘길 수 있어요(start+display-1 ≤ 1000).
// 발행량이 아주 많은 키워드는 이 1,000건이 실제로는 하루이틀치 분량밖에 안 될 수 있어서,
// sinceBoundary(예: 30일 전)에 도달하기도 전에 한도에 걸려 멈추게 됩니다. 이 경우
// "그 이전 날짜는 발행물이 0건"이 아니라 "그 이전은 확인할 수가 없는 것"인데, 예전 코드는
// 이 둘을 구분하지 않고 전부 0으로 취급해서 "최근 며칠만 반짝 높고 그 전엔 아예 없는" 것처럼
// 보이는 착시가 있었어요. capped/oldestDate로 "실제로 확인이 끝난 지점"을 기록해서,
// 그 이전 날짜는 0이 아니라 "확인 불가"로 구분합니다.
async function fetchRecentPaged(type, keyword, clientId, clientSecret, dateExtractor, sinceBoundary) {
  const items = [];
  let total = 0;
  let start = 1;
  let capped = false;

  while (true) {
    const raw = await fetchNaverSearch(type, keyword, clientId, clientSecret, {
      display: PAGE_SIZE,
      sort: "date",
      start,
    });
    if (start === 1) total = typeof raw.total === "number" ? raw.total : 0;
    const pageItems = raw.items || [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);

    const lastDate = dateExtractor(pageItems[pageItems.length - 1]);
    if (!lastDate) break; // 날짜 정보가 없는 타입(카페글 등)은 한 페이지만 봐도 충분해요.
    if (lastDate < sinceBoundary) break; // 여기서부터는 전부 더 오래된 게시물 (sinceBoundary까지 확인 완료)
    if (pageItems.length < PAGE_SIZE) break; // 더 이상 결과 없음 (전체를 다 확인함)

    start += PAGE_SIZE;
    if (start > MAX_START) {
      // sinceBoundary에 도달하기 전에 검색 결과 자체 한도(최대 1,000건)에 걸렸어요.
      // 이 지점 이전 날짜는 실제로 더 있을 수 있지만, 이 키워드로는 확인이 불가능해요.
      capped = true;
      break;
    }
  }

  // 실제로 확인이 끝난 가장 오래된 게시물의 날짜(=이보다 이전 날짜는 신뢰할 수 없음).
  let oldestDate = null;
  for (let i = items.length - 1; i >= 0; i--) {
    const d = dateExtractor(items[i]);
    if (d) {
      oldestDate = d;
      break;
    }
  }

  return { items, total, capped, oldestDate };
}

// KST 캘린더 날짜 기준으로 두 시각 사이의 일수 차이를 구합니다.
function daysBetweenKst(a, b) {
  const ap = kstDateParts(a);
  const bp = kstDateParts(b);
  const aUtc = Date.UTC(ap.year, ap.month - 1, ap.day);
  const bUtc = Date.UTC(bp.year, bp.month - 1, bp.day);
  return Math.round((aUtc - bUtc) / DAY_MS);
}

// 하나의 검색 소스(blog/news/cafearticle) 결과를 정리합니다.
// dateExtractor(item) => Date | null
// capped/oldestDate: fetchRecentPaged가 1,000건 한도에 걸렸는지 + 실제로 확인이 끝난 가장 오래된 날짜
function buildSource(raw, dateExtractor, now, since7, since30, capped, oldestDate) {
  const allItems = (raw && raw.items ? raw.items : []).map((it) => {
    const date = dateExtractor(it);
    return {
      title: cleanText(it.title),
      description: cleanText(it.description),
      link: it.link,
      date: date ? date.toISOString() : null,
      dateLabel: date ? formatDateLabel(date) : null,
    };
  });

  allItems.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  const withDates = allItems.filter((it) => it.date);
  const count7d = withDates.filter((it) => new Date(it.date) >= since7).length;
  const count30d = withDates.filter((it) => new Date(it.date) >= since30).length;

  const dailyCounts = {};
  withDates.forEach((it) => {
    const key = kstDateKey(new Date(it.date));
    dailyCounts[key] = (dailyCounts[key] || 0) + 1;
  });

  // 1,000건 한도에 걸렸고, 그 지점이 7일/30일 경계보다 최근이면 count7d/count30d도
  // 실제 값보다 적게 집계된 것(하한선)이에요. 프런트에서 "1,000건 이상"처럼 표시하도록 플래그를 내려줍니다.
  const coverageIncomplete30d = !!(capped && oldestDate && oldestDate > since30);
  const coverageIncomplete7d = !!(capped && oldestDate && oldestDate > since7);
  const coverageSinceKey = capped && oldestDate ? kstDateKey(oldestDate) : null;
  const coverageDays = capped && oldestDate ? Math.max(1, daysBetweenKst(now, oldestDate) + 1) : null;

  return {
    total: typeof raw?.total === "number" ? raw.total : 0,
    fetchedCount: allItems.length,
    hasDates: withDates.length > 0,
    count7d,
    count30d,
    coverageIncomplete7d,
    coverageIncomplete30d,
    coverageSinceKey,
    coverageDays,
    items: allItems.slice(0, 8),
    dailyCounts,
  };
}

export async function analyzeBrandContent(rawKeyword) {
  const keyword = (rawKeyword || "").trim();
  if (!keyword) {
    return { ok: false, error: "브랜드 키워드를 입력해주세요." };
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: "필요한 키가 설정되어 있지 않습니다. Vercel 프로젝트 환경변수에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET을 등록해주세요.",
    };
  }

  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);

  let blogPage, newsPage, cafeRaw;
  try {
    [blogPage, newsPage, cafeRaw] = await Promise.all([
      fetchRecentPaged("blog", keyword, clientId, clientSecret, (it) => parseBlogDate(it.postdate), since30),
      fetchRecentPaged("news", keyword, clientId, clientSecret, (it) => parseNewsDate(it.pubDate), since30),
      fetchNaverSearch("cafearticle", keyword, clientId, clientSecret),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: `콘텐츠 발행 현황을 가져오는 중 오류가 발생했습니다. (${err.message})`,
    };
  }

  const blog = buildSource(
    { total: blogPage.total, items: blogPage.items },
    (it) => parseBlogDate(it.postdate),
    now,
    since7,
    since30,
    blogPage.capped,
    blogPage.oldestDate
  );
  const news = buildSource(
    { total: newsPage.total, items: newsPage.items },
    (it) => parseNewsDate(it.pubDate),
    now,
    since7,
    since30,
    newsPage.capped,
    newsPage.oldestDate
  );
  // 카페글 검색 결과는 날짜 필드를 제공하지 않아 건수만 집계합니다.
  const cafearticle = buildSource(cafeRaw, () => null, now, since7, since30);

  // 최근 14일 발행 추이 (블로그/뉴스만 — 카페는 날짜 정보가 없어 제외)
  // coverageSinceKey보다 이전 날짜는 "0건"이 아니라 "확인 불가"라서 null로 표시합니다.
  // (1,000건 한도에 걸린 키워드는 그 이전에도 게시물이 있었을 수 있지만 API로는 셀 수 없어요.)
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const { month, day } = kstDateParts(d);
    const key = kstDateKey(d);
    const blogUnknown = !!(blog.coverageSinceKey && key < blog.coverageSinceKey);
    const newsUnknown = !!(news.coverageSinceKey && key < news.coverageSinceKey);
    trend.push({
      key,
      label: `${month}/${day}`,
      blog: blogUnknown ? null : blog.dailyCounts[key] || 0,
      news: newsUnknown ? null : news.dailyCounts[key] || 0,
    });
  }

  const trendCoverageNote = (() => {
    const parts = [];
    if (blog.coverageIncomplete30d) parts.push(`블로그는 최근 ${blog.coverageDays}일`);
    if (news.coverageIncomplete30d) parts.push(`뉴스는 최근 ${news.coverageDays}일`);
    if (parts.length === 0) return null;
    return `${parts.join(", ")}치까지만 정확히 확인했어요. 발행량이 많아 검색 결과 확인 한도(최대 1,000건)에 도달해서, 그 이전 날짜는 실제로는 더 있을 수 있지만 "0건"이 아니라 확인이 안 되는 상태예요.`;
  })();

  const totalMentions = (blog.total || 0) + (news.total || 0) + (cafearticle.total || 0);

  return {
    ok: true,
    keyword,
    fetchedAt: now.toISOString(),
    totalMentions,
    sources: { blog, news, cafearticle },
    trend,
    trendCoverageNote,
  };
}
