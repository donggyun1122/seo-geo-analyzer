// 키워드 분석 — 여러 네이버 API를 조합해 하나의 결과로 합칩니다.
// - 월간 검색량 / 연관 키워드 / 광고 경쟁정도 : 네이버 검색광고 API (keywordstool)
// - 월간 콘텐츠 발행량(블로그/카페)          : 네이버 API HUB 검색 API (기존 연동 재사용)
// - 검색 추이(월별 PC·모바일 / 월별 / 요일별) : 네이버 API HUB의 Search Trend(데이터랩) API
//
// 검색광고 API는 별도 자격 증명(NAVER_AD_*)을 쓰지만, 검색 API와 Search Trend API는
// 같은 NAVER API HUB Application의 NAVER_CLIENT_ID/NAVER_CLIENT_SECRET을 함께 씁니다
// (NCP 콘솔에서 Search Trend 상품을 추가로 이용 신청해두면 별도 키 없이 바로 동작해요).
// 하나가 설정되어 있지 않아도 나머지는 정상적으로 보여줄 수 있도록 소스별로 독립 처리합니다.
//
// ── 검색 추이를 "실제 건수"로 환산하는 방법 ──────────────────────────────────
// Search Trend API는 절대 검색량이 아니라 "요청 구간 내 최고치를 100으로 한 상대 비율"만
// 줍니다. 반면 검색광고 API(keywordstool)는 최근 한 달 PC/모바일 검색량을 절대 수치로
// 줍니다. 이 절대 수치를 "기준점(anchor)"으로 삼아, 같은 요청의 시계열 안에서만 비율을
// 실제 건수로 환산합니다 — 예를 들어 PC 월별 비율의 마지막 달(최근 달) 비율을
// 검색광고의 최근 한 달 PC 검색량에 맞춰 스케일을 구한 뒤, 같은 요청(PC 월별) 안의
// 다른 달에도 동일한 스케일을 적용하는 방식이에요. 이렇게 하면 서로 다른 요청의
// ratio끼리 비교하는 게 아니라 "한 요청 안의 ratio"만 사용하게 되어 계산이 성립합니다.
//
// ※ 성별 · 연령대별 검색 비율은 여전히 제공하지 않습니다. Search Trend API로 성별/
// 연령대를 나누려면 매번 별도 요청(gender=m, gender=f, ages=... 등)을 보내야 하는데,
// 그 ratio는 "그 요청 안에서"만 최고값을 100으로 정규화한 상대값이라 서로 다른 요청끼리
// 비교하거나 합산할 수 없습니다. 검색광고 키워드 도구 화면에 성별·연령대별 검색 비율이
// 보이는 건, 네이버 내부적으로만 쓰는(공개 API로는 제공되지 않는) 별도 데이터를 쓰기
// 때문으로 보입니다. 공개된 API 중에는 이 값을 정확하게 재현할 방법이 없어서, 부정확한
// 값을 보여주는 대신 이 항목은 제외했어요.

import { fetchNaverSearch } from "./brandContent";
import { fetchRelatedKeywords, isKeywordAdConfigured } from "./keywordAd";
import { fetchAllRawTrend, isDatalabConfigured } from "./keywordDatalab";

const BLOG_ENRICH_LIMIT = 15; // 연관 키워드 중 블로그 누적발행량까지 조회할 상위 개수 (API 호출량 제한)
const RELATED_DISPLAY_LIMIT = 60; // 화면에 보여줄 연관 키워드 최대 개수

const BLOG_PAGE_SIZE = 100;
const BLOG_MAX_START = 901; // 네이버 검색 API 한도: start + display - 1 <= 1000

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

// 블로그 검색 결과를 최신순으로 최대 1,000건(네이버 검색 API 자체 한도)까지 페이지를
// 넘겨가며 확인해서, 최근 30일 이내 발행 건수를 셉니다. 30일 경계를 만나면 그 즉시
// 멈추고(더 넘길 필요가 없으므로), 1,000건까지 다 확인했는데도 경계를 못 찾으면
// "1,000건+"로 표시할 수 있도록 capped 플래그를 반환합니다.
async function fetchBlogRecent30Paged(keyword, clientId, clientSecret, since30) {
  let recent30 = 0;
  let blogTotal = 0;
  let capped = false;
  let start = 1;

  while (true) {
    const raw = await fetchNaverSearch("blog", keyword, clientId, clientSecret, {
      display: BLOG_PAGE_SIZE,
      sort: "date",
      start,
    });
    if (start === 1) blogTotal = raw.total || 0;
    const items = raw.items || [];
    if (items.length === 0) break;

    let crossedBoundary = false;
    for (const it of items) {
      if (!it.postdate || String(it.postdate).length !== 8) continue;
      const s = String(it.postdate);
      const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00+09:00`);
      if (isNaN(d.getTime())) continue;
      if (d >= since30) {
        recent30 += 1;
      } else {
        crossedBoundary = true;
        break;
      }
    }
    if (crossedBoundary) break;
    if (items.length < BLOG_PAGE_SIZE) break; // 더 이상 결과가 없음 (전부 30일 이내)

    start += BLOG_PAGE_SIZE;
    if (start > BLOG_MAX_START) {
      capped = true; // 네이버 검색 API 자체 한도(최대 1,000건)까지 확인했지만 경계를 못 찾음
      break;
    }
  }

  return { recent30, blogTotal, capped };
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
    const [blogPaged, cafeRaw] = await Promise.all([
      fetchBlogRecent30Paged(keyword, clientId, clientSecret, since30),
      fetchNaverSearch("cafearticle", keyword, clientId, clientSecret, { display: 1, sort: "sim" }),
    ]);

    return {
      available: true,
      blogTotal: blogPaged.blogTotal,
      blogRecent30d: blogPaged.recent30,
      blogRecent30dCapped: blogPaged.capped,
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

// ── ratio 시계열 → 실제 건수 환산 헬퍼 ───────────────────────────────────────

function monthLabelFromPeriod(period) {
  const parts = String(period).split("-");
  const m = parseInt(parts[1], 10);
  return Number.isNaN(m) ? String(period) : `${m}월`;
}

function dayOfWeekKST(period) {
  const parts = String(period)
    .split("-")
    .map((x) => parseInt(x, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
}

// 한 요청의 ratio 시계열을, "그 요청 자체"의 절대 검색량 anchor 하나로 환산합니다.
// (서로 다른 요청의 ratio를 섞지 않고, 딱 이 시계열 안에서만 스케일을 구해서 적용해요.)
function scaleSeriesByAnchor(series, anchorAbsolute) {
  if (!series || series.length === 0) return { ok: false, series: [] };
  let idx = series.length - 1;
  while (idx > 0 && !(series[idx].ratio > 0)) idx -= 1;
  const anchorRatio = series[idx] ? series[idx].ratio : 0;
  if (!(anchorRatio > 0) || !(anchorAbsolute >= 0)) {
    return { ok: false, series: series.map((d) => ({ ...d, count: null })) };
  }
  const k = anchorAbsolute / anchorRatio;
  return { ok: true, series: series.map((d) => ({ ...d, count: Math.max(0, Math.round(d.ratio * k)) })) };
}

// 일별 ratio 시계열은 "최근 30일 합"을 검색광고의 최근 한 달 검색량에 맞춰 스케일을
// 구합니다. (일별 anchor가 따로 없어서, 30일 합을 월간 anchor에 맞추는 방식이에요.)
function scaleDailyByMonthlyAnchor(series, anchorAbsolute) {
  if (!series || series.length === 0) return { ok: false, series: [] };
  const last30 = series.slice(-30);
  const sumRatio = last30.reduce((s, d) => s + (d.ratio > 0 ? d.ratio : 0), 0);
  if (!(sumRatio > 0) || !(anchorAbsolute >= 0)) {
    return { ok: false, series: series.map((d) => ({ ...d, count: null })) };
  }
  const k = anchorAbsolute / sumRatio;
  return { ok: true, series: series.map((d) => ({ ...d, count: Math.max(0, Math.round(d.ratio * k)) })) };
}

function buildMonthlyAbsolute(scaledSeries) {
  return scaledSeries.map((d) => ({
    label: monthLabelFromPeriod(d.period),
    value: d.count === null || d.count === undefined ? 0 : d.count,
  }));
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~일 (Date#getDay(): 0=일,1=월,...,6=토)
const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function buildWeekdayAbsolute(scaledDailySeries) {
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  scaledDailySeries.forEach((d) => {
    if (d.count === null || d.count === undefined) return;
    const dow = dayOfWeekKST(d.period);
    if (dow === null) return;
    sums[dow] += d.count;
    counts[dow] += 1;
  });
  return WEEKDAY_ORDER.map((dow, i) => ({
    label: WEEKDAY_LABELS[i],
    value: counts[dow] > 0 ? Math.round(sums[dow] / counts[dow]) : 0,
  }));
}

function buildDeviceSeries(pcScaledSeries, moScaledSeries) {
  const len = Math.max(pcScaledSeries.length, moScaledSeries.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const p = pcScaledSeries[i];
    const m = moScaledSeries[i];
    const period = (p && p.period) || (m && m.period);
    out.push({
      period,
      monthLabel: monthLabelFromPeriod(period),
      pc: p && p.count !== undefined ? p.count : null,
      mobile: m && m.count !== undefined ? m.count : null,
    });
  }
  return out;
}

function reasonFromRawError(err) {
  if (err && err.code === "NOT_CONFIGURED") return { available: false, reason: "NOT_CONFIGURED" };
  return { available: false, reason: "ERROR", error: err && err.message };
}

// 검색 추이(월별 PC·모바일 / 월별 / 요일별)를 실제 건수로 환산해서 반환합니다.
// searchVolume(검색광고 API 결과)이 있어야 anchor를 구할 수 있어서, searchVolume이
// 먼저 확정된 뒤에 호출해야 합니다.
async function fetchTrend(keyword, searchVolume) {
  if (!isDatalabConfigured()) {
    const notConfigured = { available: false, reason: "NOT_CONFIGURED" };
    return { monthlyDevice: notConfigured, monthly: notConfigured, weekday: notConfigured };
  }

  let raw;
  try {
    raw = await fetchAllRawTrend(keyword);
  } catch (err) {
    const failed = reasonFromRawError(err);
    return { monthlyDevice: failed, monthly: failed, weekday: failed };
  }

  const hasAnchor = Boolean(searchVolume && searchVolume.available);
  const noAnchor = { available: false, reason: "NO_ANCHOR" };

  // 월별 검색 추이 (PC / 모바일)
  let monthlyDevice;
  if (!raw.pcMonthly.ok || !raw.moMonthly.ok) {
    monthlyDevice = reasonFromRawError(!raw.pcMonthly.ok ? raw.pcMonthly.error : raw.moMonthly.error);
  } else if (!hasAnchor) {
    monthlyDevice = noAnchor;
  } else {
    const pcScaled = scaleSeriesByAnchor(raw.pcMonthly.series, searchVolume.seed.pcCount);
    const moScaled = scaleSeriesByAnchor(raw.moMonthly.series, searchVolume.seed.mobileCount);
    if (!pcScaled.ok && !moScaled.ok) {
      monthlyDevice = { available: false, reason: "ERROR", error: "검색량 데이터가 없어 실제 건수로 환산할 수 없어요." };
    } else {
      monthlyDevice = { available: true, data: buildDeviceSeries(pcScaled.series, moScaled.series) };
    }
  }

  // 월별 검색 비율 → 실제 건수 (PC+모바일 합계 기준)
  let monthly;
  if (!raw.overallMonthly.ok) {
    monthly = reasonFromRawError(raw.overallMonthly.error);
  } else if (!hasAnchor) {
    monthly = noAnchor;
  } else {
    const scaled = scaleSeriesByAnchor(raw.overallMonthly.series, searchVolume.seed.totalCount);
    monthly = scaled.ok
      ? { available: true, data: buildMonthlyAbsolute(scaled.series) }
      : { available: false, reason: "ERROR", error: "검색량 데이터가 없어 실제 건수로 환산할 수 없어요." };
  }

  // 요일별 검색 비율 → 실제 건수 (최근 84일, 요일별 일 평균 건수)
  let weekday;
  if (!raw.daily.ok) {
    weekday = reasonFromRawError(raw.daily.error);
  } else if (!hasAnchor) {
    weekday = noAnchor;
  } else {
    const scaled = scaleDailyByMonthlyAnchor(raw.daily.series, searchVolume.seed.totalCount);
    weekday = scaled.ok
      ? { available: true, data: buildWeekdayAbsolute(scaled.series) }
      : { available: false, reason: "ERROR", error: "검색량 데이터가 없어 실제 건수로 환산할 수 없어요." };
  }

  return { monthlyDevice, monthly, weekday };
}

export async function analyzeKeyword(rawKeyword) {
  const keyword = (rawKeyword || "").trim();
  if (!keyword) {
    return { ok: false, error: "키워드를 입력해주세요." };
  }

  // 콘텐츠 발행량은 검색량과 무관하게 독립적으로 조회할 수 있어서 병렬로 시작하고,
  // 검색 추이는 검색광고 API의 절대 검색량(anchor)이 있어야 실제 건수로 환산할 수
  // 있어서 검색량 조회가 끝난 뒤에 이어서 진행합니다.
  const contentPromise = fetchContentVolume(keyword);
  const searchVolume = await fetchSearchVolume(keyword);
  const [content, trend] = await Promise.all([contentPromise, fetchTrend(keyword, searchVolume)]);

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
