// 브랜드 키워드로 네이버(블로그/뉴스/카페) 콘텐츠 발행 현황을 조회합니다.
// NAVER API HUB(네이버 클라우드 플랫폼) 검색 API 사용 — https://naverapihub.apigw.ntruss.com/search/v1/{type}
// (예전 방식이던 openapi.naver.com/v1/search/{type}.json + X-Naver-Client-Id 헤더는
//  검색 API가 API HUB로 이관되면서 더 이상 신규 발급이 안 됩니다.)
// 필요한 환경변수: NAVER_CLIENT_ID (API HUB Key ID), NAVER_CLIENT_SECRET (API HUB Key)

const NAVER_API_HUB_BASE = "https://naverapihub.apigw.ntruss.com/search/v1";
const NAVER_ENDPOINTS = {
  blog: `${NAVER_API_HUB_BASE}/blog`,
  news: `${NAVER_API_HUB_BASE}/news`,
  cafearticle: `${NAVER_API_HUB_BASE}/cafearticle`,
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

function formatDateLabel(date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")}`;
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
    throw new Error(
      `${type} 검색 API 호출 실패 (status ${res.status})${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`
    );
  }
  return res.json();
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
    const key = it.date.slice(0, 10);
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
      error:
        "네이버 API 키가 설정되어 있지 않습니다. Vercel 프로젝트 환경변수에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET을 등록해주세요.",
    };
  }

  let blogRaw, newsRaw, cafeRaw;
  try {
    [blogRaw, newsRaw, cafeRaw] = await Promise.all([
      fetchNaverSearch("blog", keyword, clientId, clientSecret),
      fetchNaverSearch("news", keyword, clientId, clientSecret),
      fetchNaverSearch("cafearticle", keyword, clientId, clientSecret),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: `네이버 검색 API 호출 중 오류가 발생했습니다. (${err.message})`,
    };
  }

  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);

  const blog = buildSource(blogRaw, (it) => parseBlogDate(it.postdate), since7, since30);
  const news = buildSource(newsRaw, (it) => parseNewsDate(it.pubDate), since7, since30);
  // 카페글 검색 API는 날짜 필드를 제공하지 않아 건수만 집계합니다.
  const cafearticle = buildSource(cafeRaw, () => null, since7, since30);

  // 최근 14일 발행 추이 (블로그/뉴스만 — 카페는 날짜 정보가 없어 제외)
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    trend.push({
      key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
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
