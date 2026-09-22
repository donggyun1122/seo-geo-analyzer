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
async function fetchRecentPaged(type, keyword, clientId, clientSecret, dateExtractor, sinceBoundary) {
  const items = [];
  let total = 0;
  let start = 1;

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
    if (lastDate < sinceBoundary) break; // 여기서부터는 전부 더 오래된 게시물
    if (pageItems.length < PAGE_SIZE) break; // 더 이상 결과 없음

    start += PAGE_SIZE;
    if (start > MAX_START) break; // 검색 결과 자체 한도(최대 1,000건)까지 다 확인함
  }

  return { items, total };
}

// 하나의 검색 소스(blog/news/cafearticle) 결과를 정리합니다.
// dateExtractor(item) => Date | null
function buildSource(raw, dateExtractor, since7, since30) {
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

  return {
    total: typeof raw?.total === "number" ? raw.total : 0,
    fetchedCount: allItems.length,
    hasDates: withDates.length > 0,
    count7d,
    count30d,
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

  const blog = buildSource({ total: blogPage.total, items: blogPage.items }, (it) => parseBlogDate(it.postdate), since7, since30);
  const news = buildSource({ total: newsPage.total, items: newsPage.items }, (it) => parseNewsDate(it.pubDate), since7, since30);
  // 카페글 검색 결과는 날짜 필드를 제공하지 않아 건수만 집계합니다.
  const cafearticle = buildSource(cafeRaw, () => null, since7, since30);

  // 최근 14일 발행 추이 (블로그/뉴스만 — 카페는 날짜 정보가 없어 제외)
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const { month, day } = kstDateParts(d);
    const key = kstDateKey(d);
    trend.push({
      key,
      label: `${month}/${day}`,
      blog: blog.dailyCounts[key] || 0,
      news: news.dailyCounts[key] || 0,
    });
  }

  const totalMentions = (blog.total || 0) + (news.total || 0) + (cafearticle.total || 0);

  return {
    ok: true,
    keyword,
    fetchedAt: now.toISOString(),
    totalMentions,
    sources: { blog, news, cafearticle },
    trend,
  };
}
