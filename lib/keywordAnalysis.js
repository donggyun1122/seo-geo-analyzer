// 키워드 분석 — 여러 네이버 API를 조합해 하나의 결과로 합칩니다.
// - 월간 검색량 / 연관 키워드 / 광고 경쟁정도 : 네이버 검색광고 API (keywordstool)
// - 월간 콘텐츠 발행량(블로그/카페)          : 네이버 API HUB 검색 API (기존 연동 재사용)
// - 검색량 트렌드 / 월별·요일별 검색 비율    : 네이버 데이터랩 검색어트렌드 API
//
// 각 데이터 소스는 서로 다른 자격 증명을 쓰기 때문에, 하나가 설정되어 있지 않아도
// 나머지는 정상적으로 보여줄 수 있도록 소스별로 독립적으로 처리합니다.

import { fetchNaverSearch } from "./brandContent";
import { fetchRelatedKeywords, isKeywordAdConfigured } from "./keywordAd";
import { fetchMonthlyTrend, fetchWeekdayRatio, isDatalabConfigured } from "./keywordDatalab";

const BLOG_ENRICH_LIMIT = 15; // 연관 키워드 중 블로그 누적발행량까지 조회할 상위 개수 (API 호출량 제한)
const RELATED_DISPLAY_LIMIT = 60; // 화면에 보여줄 연관 키워드 최대 개수

// 두 문자열의 글자(2-gram) 겹침 정도로 "철자 유사도"(0~100)를 계산합니다.
// (네이버 API가 제공하는 값이 아니라, 입력 키워드와 얼마나 글자 구성이 비슷한지를
//  직접 계산한 참고용 지표예요.)
function bigrams(str) {
  const s = str.replace(/\s+/g, "");
  if (s.length < 2) return [s];
  const grams = [];
  for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2));
  return grams;
}

function spellingSimilarity(a, b) {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.length === 0 || gb.length === 0) return a === b ? 100 : 0;
  const counts = new Map();
  ga.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
  let overlap = 0;
  gb.forEach((g) => {
    const c = counts.get(g) || 0;
    if (c > 0) {
      overlap += 1;
      counts.set(g, c - 1);
    }
  });
  const similarity = (2 * overlap) / (ga.length + gb.length);
  return Math.round(similarity * 100);
}

function saturationLevel(ratio) {
  if (ratio < 1) return { label: "낮음", status: "good" };
  if (ratio < 5) return { label: "보통", status: "warning" };
  if (ratio < 20) return { label: "높음", status: "warning" };
  return { label: "매우 높음", status: "critical" };
}

async function fetchContentVolume(keyword) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { available: false, reason: "NOT_CONFIGURED" };
  }

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [blogRaw, cafeRaw] = await Promise.all([
      fetchNaverSearch("blog", keyword, clientId, clientSecret, { display: 100, sort: "date" }),
      fetchNaverSearch("cafearticle", keyword, clientId, clientSecret, { display: 1, sort: "sim" }),
    ]);

    const blogItems = blogRaw.items || [];
    let recent30 = 0;
    for (const it of blogItems) {
      if (!it.postdate || String(it.postdate).length !== 8) continue;
      const s = String(it.postdate);
      const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00+09:00`);
      if (!isNaN(d.getTime()) && d >= since30) recent30 += 1;
    }
    const cappedAt100 = blogItems.length >= 100 && recent30 >= 100;

    return {
      available: true,
      blogTotal: blogRaw.total || 0,
      blogRecent30d: recent30,
      blogRecent30dCapped: cappedAt100,
      cafeTotal: cafeRaw.total || 0,
    };
  } catch (err) {
    return { available: false, reason: "ERROR", error: err.message };
  }
}

async function fetchSearchVolume(keyword) {
  if (!isKeywordAdConfigured()) {
    return { available: false, reason: "NOT_CONFIGURED" };
  }
  try {
    const list = await fetchRelatedKeywords(keyword);
    if (!list.length) {
      return { available: false, reason: "NO_DATA" };
    }
    // 검색한 키워드와 정확히 일치하는 항목을 우선 사용 (공백 제거 기준), 없으면 첫 항목 사용
    const normalized = keyword.replace(/\s+/g, "");
    const seed = list.find((k) => k.keyword === normalized) || list[0];

    const related = list
      .filter((k) => k.keyword !== seed.keyword)
      .map((k) => ({
        ...k,
        similarity: spellingSimilarity(normalized, k.keyword),
      }))
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, RELATED_DISPLAY_LIMIT);

    return {
      available: true,
      seed,
      related,
      totalRelatedFound: list.length - 1,
    };
  } catch (err) {
    if (err.code === "NOT_CONFIGURED") return { available: false, reason: "NOT_CONFIGURED" };
    return { available: false, reason: "ERROR", error: err.message };
  }
}

async function enrichBlogCounts(related, clientId, clientSecret) {
  const targets = related.slice(0, BLOG_ENRICH_LIMIT);
  const results = await Promise.all(
    targets.map(async (item) => {
      try {
        const raw = await fetchNaverSearch("blog", item.keyword, clientId, clientSecret, {
          display: 1,
          sort: "sim",
        });
        return { keyword: item.keyword, blogTotal: raw.total || 0 };
      } catch {
        return { keyword: item.keyword, blogTotal: null };
      }
    })
  );
  const map = new Map(results.map((r) => [r.keyword, r.blogTotal]));
  return related.map((item) => ({
    ...item,
    blogTotal: map.has(item.keyword) ? map.get(item.keyword) : undefined,
  }));
}

async function fetchTrend(keyword) {
  if (!isDatalabConfigured()) {
    return { available: false, reason: "NOT_CONFIGURED" };
  }
  try {
    const [{ trend, byMonth }, byWeekday] = await Promise.all([
      fetchMonthlyTrend(keyword),
      fetchWeekdayRatio(keyword),
    ]);
    return { available: true, trend, byMonth, byWeekday };
  } catch (err) {
    if (err.code === "NOT_CONFIGURED") return { available: false, reason: "NOT_CONFIGURED" };
    return { available: false, reason: "ERROR", error: err.message };
  }
}

export async function analyzeKeyword(rawKeyword) {
  const keyword = (rawKeyword || "").trim();
  if (!keyword) {
    return { ok: false, error: "키워드를 입력해주세요." };
  }

  const [content, searchVolume, trend] = await Promise.all([
    fetchContentVolume(keyword),
    fetchSearchVolume(keyword),
    fetchTrend(keyword),
  ]);

  // 상위 연관 키워드에 한해 블로그 누적발행량을 추가로 조회
  if (searchVolume.available) {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (clientId && clientSecret) {
      try {
        searchVolume.related = await enrichBlogCounts(searchVolume.related, clientId, clientSecret);
      } catch {
        // 실패해도 나머지 결과는 그대로 반환
      }
    }
  }

  // 콘텐츠 포화지수 = 블로그 누적 발행량 / 월간 총 검색량
  // (네이버가 제공하는 지표가 아니라 두 원시 데이터를 조합해 직접 계산한 참고용 지수예요.)
  let saturation = { available: false };
  if (content.available && searchVolume.available) {
    const monthlyTotal = searchVolume.seed.totalCount || 0;
    if (monthlyTotal > 0) {
      const ratio = Math.round((content.blogTotal / monthlyTotal) * 100) / 100;
      saturation = { available: true, ratio, ...saturationLevel(ratio) };
    } else {
      saturation = { available: false, reason: "NO_VOLUME" };
    }
  }

  return {
    ok: true,
    keyword,
    fetchedAt: new Date().toISOString(),
    content,
    searchVolume,
    saturation,
    trend,
  };
}
